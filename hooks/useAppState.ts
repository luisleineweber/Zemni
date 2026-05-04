import { useState, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PREFERRED_DEFAULT_MODEL_ID } from "@/lib/model-routing";
import type { Model, Subject, Status } from "@/types";

export interface UseAppStateReturn {
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
  models: Model[];
  setModels: (models: Model[]) => void;
  subjects: Subject[];
  setSubjects: (subjects: Subject[]) => void;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  selectedSubject: string;
  setSelectedSubject: (subjectId: string) => void;
  structureHints: string;
  setStructureHints: (hints: string) => void;
  status: Status;
  setStatus: (status: Status) => void;
  error: string;
  setError: (error: string) => void;
  isCoarsePointer: boolean;
  isSmallScreen: boolean;
  statsOpen: boolean;
  setStatsOpen: (open: boolean) => void;
  defaultModel: string;
  defaultStructureHints: string;
  setDefaultModel: (modelId: string) => void;
  setDefaultStructureHints: (hints: string) => void;
}

/**
 * Manages core application state: theme, models, subjects, status, error, and UI state
 */
export function useAppState(): UseAppStateReturn {
  const currentUser = useQuery(api.users.getCurrentUser);
  // Initialize theme synchronously from localStorage or system preference
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("theme");
      if (saved === "dark" || saved === "light") {
        return saved;
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
    }
    return "light";
  });
  const [models, setModels] = useState<Model[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [structureHints, setStructureHints] = useState<string>("");
  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string>("");
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [defaultStructureHints, setDefaultStructureHints] = useState<string>("");

  useEffect(() => {
    const query = window.matchMedia("(max-width: 768px)");
    const update = () => setIsSmallScreen(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(hover: none) and (pointer: coarse)");
    const update = () => setIsCoarsePointer(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, []);

  useEffect(() => {
    // Theme is already initialized in useState, just ensure it's applied to DOM
    document.documentElement.dataset.theme = theme;

    if (window.innerWidth >= 769) {
      setStatsOpen(true);
    }

    // Load user settings
    // defaultModel stays in localStorage (device-specific)
    const savedDefaultModel = window.localStorage.getItem("defaultModel");
    if (savedDefaultModel) setDefaultModel(savedDefaultModel);
    
    // defaultStructureHints will be loaded from Convex in useEffect below

    const fetchModels = async () => {
      try {
        const res = await fetch("/api/models");
        if (!res.ok) throw new Error("Could not load models.");
        const data = await res.json() as { models: Model[] };
        setModels(data.models);
        // Use saved default model, or prefer configured default, or fallback by tier.
        if (data.models.length > 0) {
          let modelToUse: string;
          
          if (savedDefaultModel && data.models.find(m => m.id === savedDefaultModel)) {
            // Use saved preference if available and valid
            modelToUse = savedDefaultModel;
          } else {
            const preferredDefaultModel = data.models.find(m => m.id === PREFERRED_DEFAULT_MODEL_ID);
            const freeModel = data.models.find(m => m.subscriptionTier === "free");
            const basicModel = data.models.find(m => m.subscriptionTier === "basic");
            const plusModel = data.models.find(m => m.subscriptionTier === "plus");
            
            modelToUse = preferredDefaultModel?.id || freeModel?.id || basicModel?.id || plusModel?.id || data.models[0].id;
            
            // Set defaultModel if not already set
            if (!savedDefaultModel) {
              setDefaultModel(modelToUse);
            }
          }
          
          setSelectedModel(modelToUse);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    };

    const fetchSubjects = async () => {
      try {
        // Get user's Notion credentials from Convex if available
        // This will be called after currentUser is loaded
        if (!currentUser) return;
        
        if (!currentUser.notionDatabaseId) return;
        
        // API endpoint will decrypt token server-side
        const url = new URL("/api/notion/subjects", window.location.origin);
        url.searchParams.set("databaseId", currentUser.notionDatabaseId);
        
        const res = await fetch(url.toString());
        if (!res.ok) return;
        const data = await res.json() as { subjects: Subject[] };
        setSubjects(data.subjects);
      } catch (err) {
        // Ignore
      }
    };

    fetchModels();
  }, []);

  // Track failed database IDs to prevent repeated calls
  const subjectsFetchFailedRef = useRef<string | null>(null);

  // Fetch subjects when user data is available
  useEffect(() => {
    if (currentUser) {
      const fetchSubjects = async () => {
        try {
          if (!currentUser.notionDatabaseId) return;
          
          // Skip if we've already failed for this database ID
          if (subjectsFetchFailedRef.current === currentUser.notionDatabaseId) {
            return;
          }
          
          // API endpoint will decrypt token server-side
          const url = new URL("/api/notion/subjects", window.location.origin);
          url.searchParams.set("databaseId", currentUser.notionDatabaseId);
          
          const res = await fetch(url.toString());
          if (!res.ok) return;
          const data = await res.json() as { subjects: Subject[]; error?: string };
          
          if (data.error) {
            // Mark this database ID as failed
            subjectsFetchFailedRef.current = currentUser.notionDatabaseId;
            return;
          }
          
          setSubjects(data.subjects);
          // Reset failure tracking on success
          subjectsFetchFailedRef.current = null;
        } catch (err) {
          // Ignore
        }
      };
      
      fetchSubjects();
    }
  }, [currentUser]);

  useEffect(() => {
    // Apply theme to DOM and save to localStorage
    if (typeof window !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
      window.localStorage.setItem("theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (defaultModel) {
      window.localStorage.setItem("defaultModel", defaultModel);
    }
  }, [defaultModel]);

  // Load defaultStructureHints from Convex when user data is available
  useEffect(() => {
    if (currentUser?.defaultStructureHints !== undefined) {
      setDefaultStructureHints(currentUser.defaultStructureHints || "");
    }
  }, [currentUser]);

  useEffect(() => {
    window.localStorage.setItem("defaultStructureHints", defaultStructureHints);
  }, [defaultStructureHints]);

  return {
    theme,
    setTheme,
    models,
    setModels,
    subjects,
    setSubjects,
    selectedModel,
    setSelectedModel,
    selectedSubject,
    setSelectedSubject,
    structureHints,
    setStructureHints,
    status,
    setStatus,
    error,
    setError,
    isCoarsePointer,
    isSmallScreen,
    statsOpen,
    setStatsOpen,
    defaultModel,
    defaultStructureHints,
    setDefaultModel,
    setDefaultStructureHints
  };
}
