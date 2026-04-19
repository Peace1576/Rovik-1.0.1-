import { LegalPageShell } from "@/components/legal-page-shell";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

const legalContactEmail =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "support@rovik.ai";

export default function PrivacyPage() {
  return (
    <LegalPageShell
      eyebrow="Rovik / Privacy"
      title="Privacy Policy"
      summary="This policy explains what information Rovik collects, how it is used, and the choices available to users."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">1. Scope</h2>
        <p className="mt-2">
          This Privacy Policy applies to Rovik’s website, account system, hosted
          assistant, downloadable desktop application, and related services effective{" "}
          {LEGAL_EFFECTIVE_DATE}.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">2. Information Rovik collects</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>Account information such as name, email address, and authentication details.</li>
          <li>User content such as prompts, messages, notes, reminders, lists, preferences, and uploaded inputs.</li>
          <li>Integration information such as tokens, account identifiers, or configuration details needed to connect supported third-party services.</li>
          <li>Technical data such as device, browser, app version, IP-derived general location, logs, and usage diagnostics.</li>
          <li>Desktop-action data such as requested app launches, folder opens, or system actions triggered by the user.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">3. How Rovik uses information</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>To provide the assistant, account access, automation features, and desktop functionality.</li>
          <li>To remember user preferences, tasks, and workflows.</li>
          <li>To operate third-party integrations you authorize.</li>
          <li>To secure the service, prevent abuse, diagnose failures, and improve reliability.</li>
          <li>To comply with legal obligations and enforce Rovik’s policies.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">4. Sharing</h2>
        <p className="mt-2">
          Rovik may share personal information with service providers and subprocessors
          that help operate hosting, authentication, analytics, model inference,
          support, storage, and connected features. Rovik may also share information
          when required by law, to protect rights or safety, or in connection with a
          business transfer.
        </p>
        <p className="mt-2">
          Rovik does not state that it sells personal information. If Rovik materially
          changes this practice, the policy must be updated before launch of that
          behavior.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">5. Cookies and tracking</h2>
        <p className="mt-2">
          Rovik may use cookies, local storage, or similar technologies for
          authentication, session continuity, preferences, security, and performance.
          Rovik does not currently promise support for browser Do Not Track signals.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">6. Retention</h2>
        <p className="mt-2">
          Rovik retains information for as long as reasonably necessary to provide the
          service, maintain account history, secure the service, comply with legal
          obligations, resolve disputes, and enforce agreements. Some data may persist
          in backups for a limited time.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">7. Security</h2>
        <p className="mt-2">
          Rovik uses administrative, technical, and organizational safeguards intended
          to protect personal information. No method of storage or transmission is
          completely secure, and Rovik cannot guarantee absolute security.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">8. Children</h2>
        <p className="mt-2">
          Rovik is not intended for children under 13 and should not be used by anyone
          who is not legally able to agree to these policies. If Rovik learns it has
          collected personal information from a child in violation of applicable law,
          it will take reasonable steps to delete it.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">9. U.S. privacy rights notice</h2>
        <p className="mt-2">
          Depending on where you live, you may have rights to request access,
          correction, deletion, or information about how your personal information is
          used. California law also requires operators that collect personally
          identifiable information online to conspicuously post a privacy policy and
          describe categories of information collected and categories of third parties
          with whom that information may be shared.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">10. International transfers</h2>
        <p className="mt-2">
          Rovik may process data in the United States or other countries where its
          providers operate. Those locations may have different privacy protections
          than your home jurisdiction.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">11. Changes to this policy</h2>
        <p className="mt-2">
          Rovik may update this Privacy Policy from time to time. Material changes
          should be reflected by an updated effective date and updated links within the
          service.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">12. Contact</h2>
        <p className="mt-2">
          Privacy requests and questions can be sent to{" "}
          <a className="text-[#0b74ff] hover:underline" href={`mailto:${legalContactEmail}`}>
            {legalContactEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
