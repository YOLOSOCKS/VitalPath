import React, { useEffect } from 'react';
import ConfidenceBadge from '../components/ConfidenceBadge';

export default function AITransparency() {
  useEffect(() => {
    document.title = 'AI Transparency | VitalPath';
    return () => { document.title = 'VitalPath | Cargo Monitor'; };
  }, []);

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-6 md:p-8 max-w-4xl mx-auto">
      <div className="space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-white font-mono uppercase tracking-wider mb-2">
            AI Transparency
          </h1>
          <p className="text-gray-400 text-sm font-mono">
            How VitalPath AI works and what you should know
          </p>
        </div>

        <section className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            What VitalPath AI Does
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            VitalPath AI monitors life-critical cargo—organs, blood products, and vaccines—using sensor data (temperature, shock, lid seal, battery) and routing context. 
            It flags risks and suggests next steps to keep shipments within cold-chain and handling specs.
          </p>
          <p className="text-amber-200/90 text-sm leading-relaxed">
            <strong>Important:</strong> All outputs are advisory only. They are not a substitute for transport protocols or receiving-facility decisions. 
            Always follow official procedures and professional judgment.
          </p>
        </section>

        <section className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            AI Limitations
          </h2>
          <ul className="space-y-2 text-gray-300 text-sm leading-relaxed list-disc list-inside">
            <li>AI systems can <strong>hallucinate</strong> — generating plausible-sounding but incorrect information.</li>
            <li>Outputs may contain errors, inaccuracies, or outdated information.</li>
            <li><strong>Human verification is required</strong> for all AI suggestions before any action is taken.</li>
          </ul>
        </section>

        <section className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            Confidence Levels
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            VitalPath AI uses a confidence score to indicate how reliable a given output may be. Confidence is calculated 
            from data quality, policy match strength, regulatory alignment, and consistency of model reasoning.
          </p>
          <p className="text-gray-400 text-xs font-mono mb-4">
            Data quality, policy match strength, regulatory alignment, and internal consistency all contribute to the score.
          </p>
          <div className="flex flex-wrap gap-3">
            <ConfidenceBadge value={92} size="lg" label="92% — High" />
            <ConfidenceBadge value={0.55} asDecimal size="lg" label="55% — Medium" />
            <ConfidenceBadge value={25} size="lg" label="25% — Low" />
          </div>
          <p className="text-gray-500 text-xs mt-4">
            Example confidence badges above. Use these to gauge when to double-check or seek additional verification.
          </p>
        </section>

        <section className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            Policy &amp; Regulatory Awareness
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            VitalPath AI interprets policy clauses and regulations based on available documentation and context. 
            These interpretations are for operational guidance only.
          </p>
          <ul className="space-y-2 text-gray-300 text-sm leading-relaxed list-disc list-inside">
            <li>Regulations may change. Always verify against current official sources.</li>
            <li>AI interpretation does <strong>not</strong> replace official regulatory guidance or legal counsel.</li>
          </ul>
        </section>

        <section className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            How We Use AI
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed mb-3">
            VitalPath AI follows a structured workflow: user input and context are processed through structured prompts, 
            validated by internal layers, and optionally reviewed by humans before presentation.
          </p>
          <p className="text-gray-400 text-sm">
            We use high-level training with domain-relevant data, structured prompts to constrain outputs, 
            validation layers to catch obvious errors, and human review where appropriate.
          </p>
        </section>

        <section className="bg-black/60 backdrop-blur-xl border border-cyan-500/30 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-cyan-400 font-mono uppercase tracking-wider mb-3">
            Transparency Commitment
          </h2>
          <p className="text-gray-300 text-sm leading-relaxed space-y-2">
            We are committed to ethical AI use. We strive for <strong>explainability</strong> — making it clear how 
            and why the system produces its outputs. We also commit to <strong>continuous improvement</strong>, 
            updating models and processes as we learn and as regulations evolve.
          </p>
        </section>
      </div>
    </div>
  );
}
