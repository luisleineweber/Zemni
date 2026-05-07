interface ProviderIconProps {
  provider: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const SIZE_MAP = {
  sm: { width: "14px", height: "14px" },
  md: { width: "16px", height: "16px" },
  lg: { width: "20px", height: "20px" },
} as const;

const warnedProviders = new Set<string>();

/**
 * SVG icons for AI model providers. Less common providers use simple placeholder marks.
 */
export function ProviderIcon({
  provider,
  className = "",
  size = "md",
}: ProviderIconProps) {
  const normalizedProvider = provider.toLowerCase();
  const sizeStyle = SIZE_MAP[size];

  // Provider icon renderer map
  const iconMap: Record<string, () => React.ReactNode> = {
    openai: () => (
      <svg
        fill="#ffffff"
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        xmlns="http://www.w3.org/2000/svg"
        stroke="#ffffff"
        aria-hidden="true"
      >
        <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"></path>
      </svg>
    ),

    anthropic: () => (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 92.2 65"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <path
          fill="#FFFFFF"
          d="M66.5,0H52.4l25.7,65h14.1L66.5,0z M25.7,0L0,65h14.4l5.3-13.6h26.9L51.8,65h14.4L40.5,0C40.5,0,25.7,0,25.7,0z
	 M24.3,39.3l8.8-22.8l8.8,22.8H24.3z"
        ></path>
      </svg>
    ),

    google: () => (
      <svg
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 65 65"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <mask
          id="maskme"
          style={{ maskType: "alpha" }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="65"
          height="65"
        >
          <path
            d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"
            fill="#000"
          />
          <path
            d="M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z"
            fill="url(#prefix__paint0_linear_2001_67)"
          />
        </mask>
        <g mask="url(#maskme)">
          <g filter="url(#prefix__filter0_f_2001_67)">
            <path
              d="M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z"
              fill="#FFE432"
            />
          </g>
          <g filter="url(#prefix__filter1_f_2001_67)">
            <path
              d="M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z"
              fill="#FC413D"
            />
          </g>
          <g filter="url(#prefix__filter2_f_2001_67)">
            <path
              d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z"
              fill="#00B95C"
            />
          </g>
          <g filter="url(#prefix__filter3_f_2001_67)">
            <path
              d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z"
              fill="#00B95C"
            />
          </g>
          <g filter="url(#prefix__filter4_f_2001_67)">
            <path
              d="M30.954 74.181c9.014-5.485 11.427-17.976 5.389-27.9-6.038-9.925-18.241-13.524-27.256-8.04-9.015 5.486-11.428 17.977-5.39 27.902 6.04 9.924 18.242 13.523 27.257 8.038z"
              fill="#00B95C"
            />
          </g>
          <g filter="url(#prefix__filter5_f_2001_67)">
            <path
              d="M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z"
              fill="#3186FF"
            />
          </g>
          <g filter="url(#prefix__filter6_f_2001_67)">
            <path
              d="M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z"
              fill="#FBBC04"
            />
          </g>
          <g filter="url(#prefix__filter7_f_2001_67)">
            <path
              d="M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z"
              fill="#3186FF"
            />
          </g>
          <g filter="url(#prefix__filter8_f_2001_67)">
            <path
              d="M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727-7.324 5.387-15.557 6.631-18.39 2.78-2.833-3.853.807-11.342 8.13-16.728 7.324-5.387 15.558-6.631 18.39-2.78z"
              fill="#749BFF"
            />
          </g>
          <g filter="url(#prefix__filter9_f_2001_67)">
            <path
              d="M31.727 16.104C43.053 5.598 46.94-8.626 40.41-15.666c-6.53-7.04-21.006-4.232-32.332 6.274s-15.214 24.73-8.683 31.77c6.53 7.04 21.006 4.232 32.332-6.274z"
              fill="#FC413D"
            />
          </g>
          <g filter="url(#prefix__filter10_f_2001_67)">
            <path
              d="M8.51 53.838c6.732 4.818 14.46 5.55 17.262 1.636 2.802-3.915-.384-10.994-7.116-15.812-6.731-4.818-14.46-5.55-17.261-1.636-2.802 3.915.383 10.994 7.115 15.812z"
              fill="#FFEE48"
            />
          </g>
        </g>
        <defs>
          <filter
            id="prefix__filter0_f_2001_67"
            x="-19.824"
            y="13.152"
            width="39.274"
            height="43.217"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="2.46"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter1_f_2001_67"
            x="-15.001"
            y="-40.257"
            width="84.868"
            height="85.688"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="11.891"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter2_f_2001_67"
            x="-20.776"
            y="11.927"
            width="79.454"
            height="90.916"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="10.109"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter3_f_2001_67"
            x="-20.776"
            y="11.927"
            width="79.454"
            height="90.916"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="10.109"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter4_f_2001_67"
            x="-19.845"
            y="15.459"
            width="79.731"
            height="81.505"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="10.109"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter5_f_2001_67"
            x="29.832"
            y="-11.552"
            width="75.117"
            height="73.758"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="9.606"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter6_f_2001_67"
            x="-38.583"
            y="-16.253"
            width="78.135"
            height="78.758"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="8.706"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter7_f_2001_67"
            x="8.107"
            y="-5.966"
            width="78.877"
            height="77.539"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="7.775"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter8_f_2001_67"
            x="13.587"
            y="-18.488"
            width="56.272"
            height="51.81"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="6.957"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter9_f_2001_67"
            x="-15.526"
            y="-31.297"
            width="70.856"
            height="69.306"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="5.876"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <filter
            id="prefix__filter10_f_2001_67"
            x="-14.168"
            y="20.964"
            width="55.501"
            height="51.571"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feGaussianBlur
              stdDeviation="7.273"
              result="effect1_foregroundBlur_2001_67"
            />
          </filter>
          <linearGradient
            id="prefix__paint0_linear_2001_67"
            x1="18.447"
            y1="43.42"
            x2="52.153"
            y2="15.004"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4893FC" />
            <stop offset=".27" stopColor="#4893FC" />
            <stop offset=".777" stopColor="#969DFF" />
            <stop offset="1" stopColor="#BD99FE" />
          </linearGradient>
        </defs>
      </svg>
    ),

    "x-ai": () => xaiIcon(),
    xai: () => xaiIcon(),

    mistralai: () => mistralIcon(),
    mistral: () => mistralIcon(),

    moonshotai: () => moonshotIcon(),
    moonshot: () => moonshotIcon(),

    deepseek: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#3b82f6" />
        <path
          d="M7.4 14.9c1.35 1.45 3.54 2.25 5.75 1.65 2.55-.7 4.2-2.86 4.08-5.17-.1-1.9-1.45-3.46-3.35-4.03 1.12 1.23 1.22 3.2.1 4.72-1.28 1.72-3.68 2.2-5.5 1.16.3.62.1 1.2-1.08 1.67Z"
          fill="white"
        />
        <circle cx="15.7" cy="10.25" r="1" fill="#3b82f6" />
      </svg>
    ),

    "z-ai": () => zaiIcon(),
    zai: () => zaiIcon(),

    qwen: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#6d5dfc" />
        <path
          d="M12 7.2a4.8 4.8 0 0 1 3.55 8.03l1.05 1.05-1.3 1.3-1.2-1.2A4.8 4.8 0 1 1 12 7.2Zm0 1.8a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
          fill="white"
        />
      </svg>
    ),

    nvidia: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#76b900" />
        <path
          d="M6.8 12.1c2.25-2.1 5.55-2.55 8.4-.98-1.33.05-2.58.5-3.42 1.28-.7.64-.7 1.52-.02 2.03.9.66 2.5.28 3.55-.85.6-.65.92-1.48.9-2.38 1.12.7 1.85 1.65 2.2 2.72-2.75 2.9-7.7 3.1-11.6-1.82Zm6.92.42c-.48.12-.85.42-.82.68.04.3.53.43 1.1.3.56-.13.98-.48.92-.78-.05-.28-.58-.38-1.2-.2Z"
          fill="white"
        />
      </svg>
    ),

    minimax: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#111827" />
        <path
          d="M7 16.5v-9h2.05L12 12.1l2.95-4.6H17v9h-1.85v-5.7l-2.45 3.75h-1.4l-2.45-3.75v5.7H7Z"
          fill="#f9fafb"
        />
      </svg>
    ),

    "arcee-ai": () => arceeIcon(),
    arcee: () => arceeIcon(),

    stepfun: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0ea5e9" />
        <path d="M7 15.5h3v-3h3v-3h4v2h-2v3h-3v3H7v-2Z" fill="white" />
      </svg>
    ),

    inception: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#be123c" />
        <path d="M8 7.5h8v2H13v5h3v2H8v-2h3v-5H8v-2Z" fill="white" />
      </svg>
    ),

    xiaomi: () => (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="5" fill="#ff6900" />
        <path
          d="M7.5 15.8V8.2h1.8v7.6H7.5Zm3.1 0V8.2h2.7c2.05 0 3.2 1.1 3.2 3.05v4.55h-1.8v-4.45c0-1-.55-1.55-1.55-1.55H12.4v6h-1.8Z"
          fill="white"
        />
      </svg>
    ),
  };

  // Helper functions for grouped icons (to reduce repetition)
  function xaiIcon() {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="226.69000244140625 196.85000610351562 546.6199951171875 606.300048828125"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <g>
          <polygon
            fill="currentColor"
            points="226.83 411.15 501.31 803.15 623.31 803.15 348.82 411.15 226.83 411.15"
          ></polygon>
          <polygon
            fill="currentColor"
            points="348.72 628.87 226.69 803.15 348.77 803.15 409.76 716.05 348.72 628.87"
          ></polygon>
          <polygon
            fill="currentColor"
            points="651.23 196.85 440.28 498.12 501.32 585.29 773.31 196.85 651.23 196.85"
          ></polygon>
          <polygon
            fill="currentColor"
            points="673.31 383.25 673.31 803.15 773.31 803.15 773.31 240.44 673.31 383.25"
          ></polygon>
        </g>
      </svg>
    );
  }

  function mistralIcon() {
    return (
      <svg
        className={className}
        style={{ ...sizeStyle, flex: "none", lineHeight: "1" }}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          d="M3.428 3.4h3.429v3.428H3.428V3.4zm13.714 0h3.43v3.428h-3.43V3.4z"
          fill="currentColor"
          opacity="0.45"
        ></path>
        <path
          d="M3.428 6.828h6.857v3.429H3.429V6.828zm10.286 0h6.857v3.429h-6.857V6.828z"
          fill="currentColor"
          opacity="0.6"
        ></path>
        <path
          d="M3.428 10.258h17.144v3.428H3.428v-3.428z"
          fill="currentColor"
          opacity="0.75"
        ></path>
        <path
          d="M3.428 13.686h3.429v3.428H3.428v-3.428zm6.858 0h3.429v3.428h-3.429v-3.428zm6.856 0h3.43v3.428h-3.43v-3.428z"
          fill="currentColor"
          opacity="0.9"
        ></path>
        <path
          d="M0 17.114h10.286v3.429H0v-3.429zm13.714 0H24v3.429H13.714v-3.429z"
          fill="currentColor"
        ></path>
      </svg>
    );
  }

  function moonshotIcon() {
    return (
      <svg
        fill="currentColor"
        fillRule="evenodd"
        height="1em"
        style={{ flex: "none", lineHeight: "1" }}
        viewBox="0 0 24 24"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <title>MoonshotAI</title>
        <path d="M1.052 16.916l9.539 2.552a21.007 21.007 0 00.06 2.033l5.956 1.593a11.997 11.997 0 01-5.586.865l-.18-.016-.044-.004-.084-.009-.094-.01a11.605 11.605 0 01-.157-.02l-.107-.014-.11-.016a11.962 11.962 0 01-.32-.051l-.042-.008-.075-.013-.107-.02-.07-.015-.093-.019-.075-.016-.095-.02-.097-.023-.094-.022-.068-.017-.088-.022-.09-.024-.095-.025-.082-.023-.109-.03-.062-.02-.084-.025-.093-.028-.105-.034-.058-.019-.08-.026-.09-.031-.066-.024a6.293 6.293 0 01-.044-.015l-.068-.025-.101-.037-.057-.022-.08-.03-.087-.035-.088-.035-.079-.032-.095-.04-.063-.028-.063-.027a5.655 5.655 0 01-.041-.018l-.066-.03-.103-.047-.052-.024-.096-.046-.062-.03-.084-.04-.086-.044-.093-.047-.052-.027-.103-.055-.057-.03-.058-.032a6.49 6.49 0 01-.046-.026l-.094-.053-.06-.034-.051-.03-.072-.041-.082-.05-.093-.056-.052-.032-.084-.053-.061-.039-.079-.05-.07-.047-.053-.035a7.785 7.785 0 01-.054-.036l-.044-.03-.044-.03a6.066 6.066 0 01-.04-.028l-.057-.04-.076-.054-.069-.05-.074-.054-.056-.042-.076-.057-.076-.059-.086-.067-.045-.035-.064-.052-.074-.06-.089-.073-.046-.039-.046-.039a7.516 7.516 0 01-.043-.037l-.045-.04-.061-.053-.07-.062-.068-.06-.062-.058-.067-.062-.053-.05-.088-.084a13.28 13.28 0 01-.099-.097l-.029-.028-.041-.042-.069-.07-.05-.051-.05-.053a6.457 6.457 0 01-.168-.179l-.08-.088-.062-.07-.071-.08-.042-.049-.053-.062-.058-.068-.046-.056a7.175 7.175 0 01-.027-.033l-.045-.055-.066-.082-.041-.052-.05-.064-.02-.025a11.99 11.99 0 01-1.44-2.402zm-1.02-5.794l11.353 3.037a20.468 20.468 0 00-.469 2.011l10.817 2.894a12.076 12.076 0 01-1.845 2.005L.657 15.923l-.016-.046-.035-.104a11.965 11.965 0 01-.05-.153l-.007-.023a11.896 11.896 0 01-.207-.741l-.03-.126-.018-.08-.021-.097-.018-.081-.018-.09-.017-.084-.018-.094c-.026-.141-.05-.283-.071-.426l-.017-.118-.011-.083-.013-.102a12.01 12.01 0 01-.019-.161l-.005-.047a12.12 12.12 0 01-.034-2.145zm1.593-5.15l11.948 3.196c-.368.605-.705 1.231-1.01 1.875l11.295 3.022c-.142.82-.368 1.612-.668 2.365l-11.55-3.09L.124 10.26l.015-.1.008-.049.01-.067.015-.087.018-.098c.026-.148.056-.295.088-.442l.028-.124.02-.085.024-.097c.022-.09.045-.18.07-.268l.028-.102.023-.083.03-.1.025-.082.03-.096.026-.082.031-.095a11.896 11.896 0 011.01-2.232zm4.442-4.4L17.352 4.59a20.77 20.77 0 00-1.688 1.721l7.823 2.093c.267.852.442 1.744.513 2.665L2.106 5.213l.045-.065.027-.04.04-.055.046-.065.055-.076.054-.072.064-.086.05-.065.057-.073.055-.07.06-.074.055-.069.065-.077.054-.066.066-.077.053-.06.072-.082.053-.06.067-.074.054-.058.073-.078.058-.06.063-.067.168-.17.1-.098.059-.056.076-.071a12.084 12.084 0 012.272-1.677zM12.017 0h.097l.082.001.069.001.054.002.068.002.046.001.076.003.047.002.06.003.054.002.087.005.105.007.144.011.088.007.044.004.077.008.082.008.047.005.102.012.05.006.108.014.081.01.042.006.065.01.207.032.07.012.065.011.14.026.092.018.11.022.046.01.075.016.041.01L14.7.3l.042.01.065.015.049.012.071.017.096.024.112.03.113.03.113.032.05.015.07.02.078.024.073.023.05.016.05.016.076.025.099.033.102.036.048.017.064.023.093.034.11.041.116.045.1.04.047.02.06.024.041.018.063.026.04.018.057.025.11.048.1.046.074.035.075.036.06.028.092.046.091.045.102.052.053.028.049.026.046.024.06.033.041.022.052.029.088.05.106.06.087.051.057.034.053.032.096.059.088.055.098.062.036.024.064.041.084.056.04.027.062.042.062.043.023.017c.054.037.108.075.161.114l.083.06.065.048.056.043.086.065.082.064.04.03.05.041.086.069.079.065.085.071c.712.6 1.353 1.283 1.909 2.031L7.222.994l.062-.027.065-.028.081-.034.086-.035c.113-.045.227-.09.341-.131l.096-.035.093-.033.084-.03.096-.031c.087-.03.176-.058.264-.085l.091-.027.086-.025.102-.03.085-.023.1-.026L9.04.37l.09-.023.091-.022.095-.022.09-.02.098-.021.091-.02.095-.018.092-.018.1-.018.091-.016.098-.017.092-.014.097-.015.092-.013.102-.013.091-.012.105-.012.09-.01.105-.01c.093-.01.186-.018.28-.024l.106-.008.09-.005.11-.006.093-.004.1-.004.097-.002.099-.002.197-.002z"></path>
      </svg>
    );
  }

  function zaiIcon() {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="4" y="4" width="16" height="16" rx="2" fill="#8b5cf6" />
        <path
          d="M8 8h8l-8 8h8"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function arceeIcon() {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className}
        style={sizeStyle}
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#0f766e" />
        <path
          d="M7.2 16.5 11.1 7.5h1.8l3.9 9h-2.1l-.66-1.68h-4.08L9.3 16.5H7.2Zm3.44-3.4h2.72L12 9.65l-1.36 3.45Z"
          fill="white"
        />
      </svg>
    );
  }

  const getIcon = () => {
    const icon = iconMap[normalizedProvider];

    if (!icon && process.env.NODE_ENV !== "production" && !warnedProviders.has(normalizedProvider)) {
      warnedProviders.add(normalizedProvider);
      console.warn(`ProviderIcon: unknown provider "${provider}", using default icon.`);
    }

    return icon?.() ?? iconMap.default?.();
  };

  // Default icon
  iconMap.default = () => (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={sizeStyle}
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="3"
        fill="var(--text-muted)"
      />
      <path
        d="M7 12a5 5 0 0 1 8.7-3.35M17 12a5 5 0 0 1-8.7 3.35"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M15.4 6.6v3.1h-3.1M8.6 17.4v-3.1h3.1"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return getIcon();
}
