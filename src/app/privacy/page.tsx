import React from "react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-3xl shadow-sm border border-slate-200">
        <h1 className="text-3xl font-black text-slate-900 mb-6">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: August 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-slate-600">
          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-2">1. Overview</h2>
            <p>
              This application is designed to help you manage and schedule posts to your authorized Facebook Pages. 
              We respect your privacy and only request access tokens necessary to publish your scheduled content.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-2">2. Data We Collect</h2>
            <p>
              We only store your Page IDs, Page Names, and encrypted Page Access Tokens required to post scheduled content to Facebook on your behalf.
              We do not sell, rent, or share your personal data with third parties.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-2">3. Token Security</h2>
            <p>
              All Facebook Page access tokens are strongly encrypted using AES-256-GCM encryption before being stored in our database.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-800 mb-2">4. Data Deletion</h2>
            <p>
              You can disconnect your Facebook Pages or delete any scheduled posts at any time directly through the application interface.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
