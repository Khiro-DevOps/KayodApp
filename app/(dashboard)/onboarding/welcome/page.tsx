"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, ArrowRight, Calendar, Briefcase } from "lucide-react";

export default function OnboardingWelcomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<any>(null);
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState<string | null>(null);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      // Get profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      setProfile(profileData);

      // Get employee record
      const { data: employeeData } = await supabase
        .from("employees")
        .select("*")
        .eq("profile_id", user.id)
        .single();

      if (employeeData) {
        setEmployee(employeeData);
        setStartDate(employeeData.start_date);
      }
    } catch (error) {
      console.error("Failed to load user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // Redirect to employee dashboard
    router.push("/dashboard/payroll");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your onboarding...</p>
        </div>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-2xl">
        {/* Success Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header with Success Icon */}
          <div className="bg-gradient-to-r from-green-400 to-emerald-500 p-8 text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">
              Welcome to the Team! 🎉
            </h1>
            <p className="text-green-100 text-lg">
              Your contract has been signed and confirmed
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            {/* Greeting */}
            <div className="text-center mb-8">
              <p className="text-2xl font-semibold text-gray-800">
                Hello,{" "}
                <span className="text-emerald-600">
                  {profile?.first_name} {profile?.last_name}
                </span>
                !
              </p>
              <p className="text-gray-600 mt-2">
                You are now officially part of our organization
              </p>
            </div>

            {/* Details Cards */}
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              {/* Start Date */}
              <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-100 rounded-lg p-3">
                    <Calendar className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Start Date
                    </p>
                    <p className="text-lg font-bold text-gray-800 mt-1">
                      {startDate ? formatDate(startDate) : "To be confirmed"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Position */}
              <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                <div className="flex items-start gap-4">
                  <div className="bg-purple-100 rounded-lg p-3">
                    <Briefcase className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Position
                    </p>
                    <p className="text-lg font-bold text-gray-800 mt-1">
                      {employee?.job_title || "Employee"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Next Steps */}
            <div className="bg-gray-50 rounded-lg p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                What's Next?
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-1">✓</span>
                  <span className="text-gray-700">
                    Set up your work schedule
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-1">✓</span>
                  <span className="text-gray-700">
                    Review company policies
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-1">✓</span>
                  <span className="text-gray-700">
                    Complete onboarding documents
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 font-bold mt-1">✓</span>
                  <span className="text-gray-700">Meet your manager</span>
                </li>
              </ul>
            </div>

            {/* Important Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-8">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> Your dashboard now shows employee-specific
                features. You can access payroll, schedules, leave requests, and
                more from your new employee dashboard.
              </p>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleContinue}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-semibold py-4 rounded-lg transition transform hover:scale-105 flex items-center justify-center gap-2 group"
            >
              <span>Go to Employee Dashboard</span>
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition" />
            </button>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-8 py-4 border-t text-center">
            <p className="text-sm text-gray-600">
              Questions? Contact{" "}
              <a
                href="mailto:hr@kayod.com"
                className="text-emerald-600 hover:underline"
              >
                HR@kayod.com
              </a>
            </p>
          </div>
        </div>

        {/* Footer Message */}
        <p className="text-center text-gray-600 text-sm mt-8">
          We're excited to have you on board! 🚀
        </p>
      </div>
    </div>
  );
}
