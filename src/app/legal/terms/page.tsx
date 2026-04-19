import { LegalPageShell } from "@/components/legal-page-shell";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

const legalContactEmail =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "support@rovik.ai";

export default function TermsPage() {
  return (
    <LegalPageShell
      eyebrow="Rovik / Terms"
      title="Terms of Use"
      summary="These terms govern access to Rovik’s website, hosted assistant, integrations, and account-based services."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">1. Agreement to these terms</h2>
        <p className="mt-2">
          By accessing, creating an account for, downloading, or using Rovik, you
          agree to these Terms of Use effective {LEGAL_EFFECTIVE_DATE}. If you do not
          agree, do not use Rovik.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">2. What Rovik is</h2>
        <p className="mt-2">
          Rovik is an AI-powered assistant product that can help users manage tasks
          across home, digital life, and work, including research, reminders, inbox
          triage, desktop actions, and smart-device or third-party integration flows.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">3. User responsibility and approvals</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>You are responsible for the commands you give Rovik and the consequences of using its outputs.</li>
          <li>You are responsible for reviewing generated content, suggested automations, and any action taken through third-party services or devices.</li>
          <li>You must review and approve sensitive actions before relying on them, including purchases, money movement, smart-lock or security actions, and communications sent to others.</li>
          <li>You remain responsible for compliance with laws, contracts, and workplace or household rules that apply to your use.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">4. No professional advice</h2>
        <p className="mt-2">
          Rovik does not provide legal, medical, tax, accounting, investment, or
          other regulated professional advice. Any information provided is for general
          informational and operational assistance only.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">5. Accounts and security</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>You must provide accurate account information.</li>
          <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
          <li>You must notify Rovik promptly of unauthorized access or suspected compromise.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">6. Acceptable use</h2>
        <p className="mt-2">
          You must follow the Acceptable Use Policy. You may not use Rovik for
          unlawful, harmful, fraudulent, privacy-invasive, abusive, or security-
          circumventing behavior.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">7. Third-party services and devices</h2>
        <p className="mt-2">
          Rovik may connect with email providers, calendars, media services,
          automation platforms, and devices. Those services are governed by their own
          terms and privacy policies. Rovik is not responsible for downtime, data
          loss, account suspension, billing, or device behavior caused by third-party
          providers.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">8. Service availability and changes</h2>
        <p className="mt-2">
          Rovik may change, suspend, or discontinue features at any time. Access may
          be interrupted by maintenance, outages, upstream provider issues, or safety
          controls.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">9. Disclaimers</h2>
        <p className="mt-2">
          Rovik is provided on an “as is” and “as available” basis to the maximum
          extent permitted by law. Rovik does not guarantee that outputs will be
          accurate, complete, safe, uninterrupted, or suitable for any particular
          purpose.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">10. Limitation of liability</h2>
        <p className="mt-2">
          To the maximum extent permitted by law, Rovik and its founders, officers,
          employees, contractors, and affiliates will not be liable for indirect,
          incidental, consequential, special, exemplary, or punitive damages, or for
          loss of profits, revenues, data, goodwill, business interruption, device
          failures, automation outcomes, or third-party service failures arising out
          of or related to your use of Rovik.
        </p>
        <p className="mt-2">
          To the maximum extent permitted by law, Rovik’s total liability for claims
          arising out of or related to the service will not exceed the greater of the
          amount you paid Rovik in the twelve months before the claim arose or
          fifty U.S. dollars.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">11. Indemnity</h2>
        <p className="mt-2">
          You will indemnify and hold harmless Rovik and its affiliates from claims,
          liabilities, damages, losses, and expenses arising from your misuse of
          Rovik, your violation of these terms, or your violation of any law or third-
          party rights.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">12. Termination</h2>
        <p className="mt-2">
          Rovik may suspend or terminate access if you violate these terms, create
          safety or abuse risk, or expose Rovik, users, devices, or third parties to
          harm or liability.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">13. Changes to these terms</h2>
        <p className="mt-2">
          Rovik may update these terms. Continued use after an update means you accept
          the revised terms.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">14. Contact</h2>
        <p className="mt-2">
          Legal and terms questions can be sent to{" "}
          <a className="text-[#0b74ff] hover:underline" href={`mailto:${legalContactEmail}`}>
            {legalContactEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
