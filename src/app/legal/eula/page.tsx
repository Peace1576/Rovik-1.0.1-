import { LegalPageShell } from "@/components/legal-page-shell";

const legalContactEmail =
  process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL || "support@rovik.ai";

export default function EulaPage() {
  return (
    <LegalPageShell
      eyebrow="Rovik / Desktop App EULA"
      title="Windows Desktop App End User License Agreement"
      summary="This license applies to the Rovik Windows desktop application, packaged downloads, and related updates."
    >
      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">1. License grant</h2>
        <p className="mt-2">
          Rovik grants you a limited, revocable, non-exclusive, non-transferable
          license to download, install, and use the Rovik Windows desktop application
          for your internal personal or business use, subject to the Terms of Use and
          this EULA.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">2. Ownership</h2>
        <p className="mt-2">
          Rovik and its licensors retain all rights, title, and interest in the
          software, updates, branding, and related materials except for the limited
          license expressly granted here.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">3. Restrictions</h2>
        <ul className="mt-2 list-disc pl-6">
          <li>You may not resell, sublicense, rent, lease, or distribute the software except as allowed by law or Rovik’s written permission.</li>
          <li>You may not remove notices, misrepresent origin, or use the software to violate Rovik’s policies.</li>
          <li>You may not use the desktop app to access or control systems you are not authorized to use.</li>
          <li>You may not attempt to use the software to extract other users’ data or private credentials.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">4. Updates</h2>
        <p className="mt-2">
          Rovik may provide updates, fixes, or changes. Some updates may be required
          for security, compatibility, or continued operation.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">5. Third-party components</h2>
        <p className="mt-2">
          The desktop app may include or rely on open-source or third-party software
          under separate license terms. Your use of those components remains subject to
          their applicable licenses.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">6. Termination</h2>
        <p className="mt-2">
          This license ends automatically if you violate this EULA or Rovik’s Terms of
          Use. Upon termination, you must stop using and delete the software.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">7. Warranty disclaimer and liability limit</h2>
        <p className="mt-2">
          The software is provided “as is” and “as available” to the maximum extent
          permitted by law. Rovik disclaims warranties of merchantability, fitness for
          a particular purpose, non-infringement, and uninterrupted operation. Rovik’s
          liability remains subject to the limits in the Terms of Use.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[#09101d]">8. Contact</h2>
        <p className="mt-2">
          Questions about desktop licensing can be sent to{" "}
          <a className="text-[#0b74ff] hover:underline" href={`mailto:${legalContactEmail}`}>
            {legalContactEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageShell>
  );
}
