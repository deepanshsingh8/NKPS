"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, GraduationCap } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function getDashboardPath(role: string): string {
  switch (role) {
    case "admin":
    case "editor":
      return "/admin";
    case "teacher":
      return "/teacher";
    case "student":
      return "/student";
    default:
      return "/";
  }
}

export default function PortalLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      // Fetch user profile to determine role
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (profileError) {
        toast.error("Unable to fetch user profile. Please contact administration.");
        return;
      }

      const role = profile?.role || "student";
      const dashboard = getDashboardPath(role);

      toast.success("Logged in successfully");
      router.push(dashboard);
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen">
      {/* Left Panel — Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-navy-900 relative flex-col items-center justify-center px-12 text-white overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <div className="absolute top-10 left-10 w-72 h-72 bg-gold-500 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-blue-600 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 text-center max-w-md">
          {/* School Logo */}
          <div className="mx-auto mb-8 flex h-24 w-24 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm border border-white/20">
            <GraduationCap className="h-12 w-12 text-gold-500" />
          </div>

          <h1 className="font-heading text-4xl font-bold mb-4">
            NK Public School
          </h1>
          <div className="w-16 h-1 bg-gold-500 mx-auto mb-6 rounded-full" />
          <p className="text-lg text-white/70 leading-relaxed">
            Welcome to the NKPS Portal. Access your dashboard to manage
            academics, resources, and more.
          </p>

          {/* Role indicators */}
          <div className="mt-12 flex flex-col gap-3 text-sm text-white/50">
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-gold-500" />
              <span>Administrators</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-400" />
              <span>Teachers</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Students</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center bg-cream-50 px-6 py-12">
        <div className="w-full max-w-md">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-navy-900">
              <GraduationCap className="h-8 w-8 text-gold-500" />
            </div>
            <h1 className="font-heading text-2xl font-bold text-navy-900">
              NK Public School
            </h1>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
            <div className="mb-8">
              <h2 className="font-heading text-2xl font-bold text-navy-900">
                Sign in to Portal
              </h2>
              <p className="text-gray-500 mt-1 text-sm">
                Enter your credentials to access your dashboard
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-navy-900 font-medium">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@nkps.edu.in"
                  {...register("email")}
                  className="h-11 border-gray-200 focus:border-navy-900 focus:ring-navy-900"
                />
                {errors.email && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-navy-900 font-medium">
                    Password
                  </Label>
                  <Link
                    href="/portal/forgot-password"
                    className="text-xs text-gold-600 hover:text-gold-500 font-medium transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  {...register("password")}
                  className="h-11 border-gray-200 focus:border-navy-900 focus:ring-navy-900"
                />
                {errors.password && (
                  <p className="text-red-500 text-xs mt-1">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-navy-900 hover:bg-navy-800 text-white font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </div>

          {/* Register link */}
          <div className="mt-4 text-center">
            <Link
              href="/portal/register"
              className="text-sm text-gold-600 hover:text-gold-500 font-medium transition-colors"
            >
              Don&apos;t have an account? Register here
            </Link>
          </div>

          {/* Back to website link */}
          <div className="mt-3 text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-navy-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to website
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
