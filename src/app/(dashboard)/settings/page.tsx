"use client";

import { useTheme, type Theme } from "@/shared/hooks/useTheme";

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "Always use light mode" },
  { value: "dark", label: "Dark", description: "Always use dark mode" },
  { value: "system", label: "System", description: "Follow your OS preference" },
];

export default function SettingsPage() {
  const { theme, setTheme, mounted } = useTheme();

  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>

      {/* Appearance */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Appearance</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Choose your preferred color theme.</p>

        <div className="grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map((option) => {
            const isSelected = mounted && theme === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setTheme(option.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors cursor-pointer ${
                  isSelected
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                }`}
              >
                {/* Theme preview */}
                <div className={`w-full h-16 rounded-lg border overflow-hidden ${
                  option.value === "dark"
                    ? "bg-gray-900 border-gray-700"
                    : option.value === "light"
                    ? "bg-white border-gray-200"
                    : "bg-gradient-to-r from-white to-gray-900 border-gray-300"
                }`}>
                  <div className="flex h-full">
                    <div className={`w-1/4 h-full ${
                      option.value === "dark" ? "bg-gray-800" : option.value === "light" ? "bg-gray-50" : "bg-gradient-to-r from-gray-50 to-gray-800"
                    }`} />
                    <div className="flex-1 p-1.5 flex flex-col gap-1">
                      <div className={`h-1.5 w-3/4 rounded-full ${
                        option.value === "dark" ? "bg-gray-700" : option.value === "light" ? "bg-gray-200" : "bg-gray-400"
                      }`} />
                      <div className={`h-1.5 w-1/2 rounded-full ${
                        option.value === "dark" ? "bg-gray-700" : option.value === "light" ? "bg-gray-200" : "bg-gray-400"
                      }`} />
                    </div>
                  </div>
                </div>

                <div className="text-center">
                  <p className={`text-sm font-medium ${
                    isSelected ? "text-blue-700 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                  }`}>
                    {option.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{option.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
