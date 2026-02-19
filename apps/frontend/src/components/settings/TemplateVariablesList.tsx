import type { TemplateVariable } from '../../types/streamer';

interface TemplateVariablesListProps {
  variables: TemplateVariable[];
}

export function TemplateVariablesList({ variables }: TemplateVariablesListProps) {
  return (
    <div className="bg-white/5 rounded-xl p-4 mt-3">
      <p className="text-xs text-white/50 mb-2 font-medium">Доступные переменные:</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {variables.map((v) => (
          <div key={v.name} className="flex items-baseline gap-2 text-xs">
            <code className="text-accent/80 bg-white/5 px-1.5 py-0.5 rounded shrink-0">
              {`{${v.name}}`}
            </code>
            <span className="text-white/30 truncate">{v.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
