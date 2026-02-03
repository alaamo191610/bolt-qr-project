import React, { useState, useEffect } from "react";
// import { useAuth } from "../../hooks/useAuth";
import { useAuth } from "../../providers/AuthProvider";
import { useNavigate } from "react-router-dom";

import { useLanguage } from "../../contexts/LanguageContext";
import { LogIn, UserPlus, Loader2 } from "lucide-react";
import LanguageToggle from "../common/LanguageToggle";

const AuthForm: React.FC = () => {
  const { t } = useLanguage();
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
      navigate("/");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      {/* Language Toggle - Top Right */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageToggle variant="button" />
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-xl flex items-center justify-center mx-auto mb-4">
            <LogIn className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {isSignUp ? t("auth.createAccount") : t("auth.welcome")}
          </h1>
          <p className="text-slate-600">
            {isSignUp
              ? t("auth.signUpDescription")
              : t("auth.signInDescription")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t("auth.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder={t("auth.emailPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              placeholder={t("auth.passwordPlaceholder")}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 font-medium shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {isSignUp ? (
                  <UserPlus className="w-5 h-5" />
                ) : (
                  <LogIn className="w-5 h-5" />
                )}
                <span>{isSignUp ? t("auth.signUp") : t("auth.signIn")}</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            {isSignUp
              ? t("auth.alreadyHaveAccount")
              : t("auth.dontHaveAccount")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
