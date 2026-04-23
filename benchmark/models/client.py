"""OpenRouter API client with async support, model availability checks, and cost tracking."""
import asyncio
import os
import time
from pathlib import Path
from typing import Optional, Dict, Any, List
import httpx
from dotenv import load_dotenv

# Try to load .env.local first, then fall back to .env
env_path = Path(__file__).parent.parent.parent / ".env.local"
if not env_path.exists():
    env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class ModelClient:
    """Async OpenRouter API client with cost tracking and model availability checks."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or OPENROUTER_API_KEY
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable is required")
        
        self.client = httpx.AsyncClient(
            base_url=OPENROUTER_BASE_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "http://localhost:3420"),
                "X-Title": os.getenv("OPENROUTER_APP_NAME", "Summary Maker Benchmark"),
                "Content-Type": "application/json"
            },
            timeout=120.0
        )
        self._available_models_cache: Optional[List[str]] = None
    
    async def check_model_availability(self, model_id: str) -> bool:
        """Check if a model is available by making a minimal test request."""
        try:
            response = await self.client.post(
                "/chat/completions",
                json={
                    "model": model_id,
                    "messages": [{"role": "user", "content": "test"}],
                    "max_tokens": 5
                }
            )
            if response.status_code != 200:
                # Log error for debugging
                try:
                    error_data = response.json()
                    print(f"[WARN] Model {model_id} unavailable: {error_data.get('error', {}).get('message', f'Status {response.status_code}')}")
                except ValueError:
                    print(f"[WARN] Model {model_id} unavailable: Status {response.status_code}")
            return response.status_code == 200
        except Exception as e:
            print(f"[WARN] Model {model_id} check failed: {str(e)}")
            return False
    
    async def check_models_availability(self, model_ids: List[str]) -> Dict[str, bool]:
        """Check availability of multiple models in parallel."""
        tasks = [self.check_model_availability(model_id) for model_id in model_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        availability = {}
        for model_id, result in zip(model_ids, results):
            if isinstance(result, Exception):
                availability[model_id] = False
            else:
                availability[model_id] = result
        
        return availability
    
    async def generate(
        self,
        model_id: str,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 2000,
        temperature: float = 0.2,
        max_retries: int = 2,
        pricing: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate text using OpenRouter API.
        
        Returns:
            Dict with keys: text, usage (prompt_tokens, completion_tokens, total_tokens),
            cost, latency_ms, error (if any)
        """
        start_time = time.time()
        
        def extract_choice_text(choice: Dict[str, Any]) -> str:
            """
            OpenRouter generally returns chat-completions-like payloads, but some models/providers
            may vary (e.g. content as parts, or legacy `text` field). Keep extraction defensive.
            """
            message = choice.get("message") or {}
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str):
                    return content
                if isinstance(content, list):
                    parts: List[str] = []
                    for part in content:
                        if isinstance(part, str):
                            parts.append(part)
                            continue
                        if isinstance(part, dict):
                            # OpenAI-style content parts: {"type":"text","text":"..."}
                            text_part = part.get("text")
                            if isinstance(text_part, str):
                                parts.append(text_part)
                    return "".join(parts)
                if isinstance(content, dict):
                    text_part = content.get("text")
                    if isinstance(text_part, str):
                        return text_part

                refusal = message.get("refusal")
                if isinstance(refusal, str) and refusal.strip():
                    return refusal

            legacy_text = choice.get("text")
            if isinstance(legacy_text, str):
                return legacy_text

            delta = choice.get("delta")
            if isinstance(delta, dict):
                delta_content = delta.get("content")
                if isinstance(delta_content, str):
                    return delta_content

            return ""

        payload = {
            "model": model_id,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        
        last_error = None
        for attempt in range(max_retries + 1):
            try:
                # Some providers occasionally return empty `message.content` even with non-zero token usage.
                # Retrying with a smaller token cap reduces the chance of these "empty content" anomalies.
                attempt_max_tokens = max_tokens if attempt == 0 else min(max_tokens, 1024)
                payload["max_tokens"] = attempt_max_tokens

                response = await self.client.post("/chat/completions", json=payload)
                response.raise_for_status()
                
                data = response.json()
                choice = data.get("choices", [{}])[0]
                text = extract_choice_text(choice)
                usage = data.get("usage", {})
                
                latency_ms = (time.time() - start_time) * 1000

                # Treat empty content with non-zero completion usage as retryable.
                completion_tokens = usage.get("completion_tokens", 0) or 0
                if (not text or not str(text).strip()) and completion_tokens > 0 and attempt < max_retries:
                    last_error = "Empty content returned from API (retrying)"
                    await asyncio.sleep(0.5 * (attempt + 1))
                    continue
                
                # Calculate cost when pricing is provided
                cost = self._calculate_cost(
                    model_id,
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    pricing
                )
                
                return {
                    "text": text,
                    "usage": {
                        "prompt_tokens": usage.get("prompt_tokens", 0),
                        "completion_tokens": usage.get("completion_tokens", 0),
                        "total_tokens": usage.get("total_tokens", 0)
                    },
                    "cost": cost,
                    "latency_ms": latency_ms,
                    "error": None,
                    "finish_reason": choice.get("finish_reason")
                }
            except httpx.HTTPStatusError as e:
                last_error = f"HTTP {e.response.status_code}: {e.response.text}"
                if e.response.status_code == 429:  # Rate limit
                    await asyncio.sleep(2 ** attempt)  # Exponential backoff
                elif e.response.status_code >= 500:  # Server error
                    await asyncio.sleep(1 * attempt)
                else:
                    break
            except Exception as e:
                last_error = str(e)
                if attempt < max_retries:
                    await asyncio.sleep(1 * attempt)
                else:
                    break
        
        latency_ms = (time.time() - start_time) * 1000
        return {
            "text": "",
            "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
            "cost": 0.0,
            "latency_ms": latency_ms,
            "error": last_error
        }
    
    def _calculate_cost(
        self,
        model_id: str,
        prompt_tokens: int,
        completion_tokens: int,
        pricing: Optional[Dict[str, Any]] = None
    ) -> float:
        """Calculate cost based on token usage and pricing."""
        if pricing is None:
            return 0.0
        
        input_per_1m = pricing.get("input_per_1m")
        output_per_1m = pricing.get("output_per_1m")
        
        if input_per_1m is None or output_per_1m is None:
            print(f"[COST] Incomplete pricing for model {model_id}: input={input_per_1m}, output={output_per_1m}")
            input_per_1m = input_per_1m or 0
            output_per_1m = output_per_1m or 0
        
        input_cost = (prompt_tokens / 1_000_000) * input_per_1m
        output_cost = (completion_tokens / 1_000_000) * output_per_1m
        
        return input_cost + output_cost
    
    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, _exc_type, _exc_val, _exc_tb):
        await self.close()
