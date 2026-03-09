"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "customer">("admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body =
        role === "admin"
          ? { role, email, password, full_name: fullName }
          : { role, email, password, first_name: firstName, last_name: lastName };

      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Signup failed");
        setLoading(false);
        return;
      }

      router.push("/login?message=account-created");
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  }

  const inputClasses =
    "w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md p-8 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Create Account
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sign up for Agentic Bank
          </p>
        </div>

        {/* Role toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setRole("admin")}
            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
              role === "admin"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}
          >
            Admin / Teller
          </button>
          <button
            type="button"
            onClick={() => setRole("customer")}
            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${
              role === "customer"
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}
          >
            Customer
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {role === "admin" ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputClasses}
                disabled={loading}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name
                </label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClasses}
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClasses}
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClasses}
              disabled={loading}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Minimum 6 characters
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-6">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
