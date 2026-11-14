/** Small "Data source" line shown on every panel. `simulated` adds a "Simulated" tag (icon + word). */
export default function SourceLabel({ source, simulated = false }) {
  if (!source) return null;
  return (
    <p className="source-label">
      <span className="source-label__key">Data source:</span> {source}
      {simulated && <span className="prov__sim source-label__sim">Simulated</span>}
    </p>
  );
}
