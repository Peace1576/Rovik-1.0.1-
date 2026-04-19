import { LegalPageShell } from "@/components/legal-page-shell";

export default function AcceptableUsePage() {
  return (
    <LegalPageShell
      eyebrow="Rovik / Acceptable Use"
      title="Acceptable Use Policy"
      summary="This policy describes prohibited uses of Rovik’s website, assistant, APIs, integrations, and desktop application."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">1. Use Rovik lawfully</h2>
        <p className="mt-2">
          You may not use Rovik to violate the law, infringe rights, commit fraud,
          evade safety controls, or interfere with the security or availability of any
          service, device, system, or network.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">2. Prohibited conduct</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>Harassment, stalking, intimidation, impersonation, or abusive communications.</li>
          <li>Spam, phishing, credential theft, malware delivery, or unauthorized access attempts.</li>
          <li>Commands intended to evade login protections, extract secrets, or bypass permission boundaries.</li>
          <li>Using Rovik to make decisions in high-risk contexts without qualified human review.</li>
          <li>Using Rovik to unlock doors, disable alarms, or perform dangerous automation without clear authorization.</li>
          <li>Collecting or exposing another person’s data without lawful basis or consent.</li>
          <li>Any use that could damage devices, third-party accounts, or connected services.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">3. Safety-critical limits</h2>
        <p className="mt-2">
          You may not use Rovik as the sole basis for medical, legal, tax, financial,
          employment, housing, emergency response, security, transportation, or other
          high-impact decisions.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">4. Connected accounts and devices</h2>
        <p className="mt-2">
          You may connect only accounts and devices you are authorized to use. You are
          responsible for reviewing permissions granted to Rovik and disconnecting
          integrations you no longer want active.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">5. Enforcement</h2>
        <p className="mt-2">
          Rovik may investigate suspected violations, suspend access, remove content,
          revoke integrations, or terminate accounts when reasonably necessary to
          protect users, devices, third parties, or the service.
        </p>
      </section>
    </LegalPageShell>
  );
}
