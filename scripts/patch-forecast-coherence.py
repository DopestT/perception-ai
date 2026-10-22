from pathlib import Path

path = Path('src/App.tsx')
source = path.read_text()

anchor = "  const verifiedEvidenceCount = world?.verifications.reduce((sum, verification) => sum + (verification.evidence?.length ?? 0), 0) ?? 0\n"
replacement = anchor + "  const activeForecast = forecast && world && forecast.project_id === world.project.id ? forecast : null\n"
if source.count(anchor) != 1:
    raise SystemExit('activeForecast anchor mismatch')
source = source.replace(anchor, replacement, 1)

start = source.index('      {world && (')
end = source.index('      {!world && session && !loading && (', start)
result = source[start:end]
result = result.replace("forecast ? 'PERCEPTION FORECAST' : 'PERCEPTION RESULT'", "activeForecast ? 'PERCEPTION FORECAST' : 'PERCEPTION RESULT'")
result = result.replace("{forecast\n                ? `${Math.round(forecast.current_probability * 100)}% — ${forecast.question}`", "{activeForecast\n                ? `${Math.round(activeForecast.current_probability * 100)}% — ${activeForecast.question}`")
result = result.replace("{forecast\n                ? `This is the current calibrated estimate", "{activeForecast\n                ? `This is the current calibrated estimate")
result = result.replace("{(forecast || canContinueObjective) && (", "{(activeForecast || canContinueObjective) && (")
result = result.replace("onClick={forecast ? handleRunIntelligence : handleContinueRoute}", "onClick={activeForecast ? handleRunIntelligence : handleContinueRoute}")
result = result.replace("{forecast ? `${Math.round(forecast.current_probability * 100)}% current probability`", "{activeForecast ? `${Math.round(activeForecast.current_probability * 100)}% current probability`")
result = result.replace("<p>{forecast ? `${verifiedEvidenceCount}", "<p>{activeForecast ? `${verifiedEvidenceCount}")
result = result.replace(" : forecast ? 'Confidence should stay provisional.'", " : activeForecast ? 'Confidence should stay provisional.'")
result = result.replace("<p>{forecast ? 'Probability can change", "<p>{activeForecast ? 'Probability can change")
result = result.replace("<h2>{forecast ? 'Run fresh intelligence", "<h2>{activeForecast ? 'Run fresh intelligence")
result = result.replace("<p>{forecast ? 'Perception can scan", "<p>{activeForecast ? 'Perception can scan")
result = result.replace("{forecast ? (\n                    <ForecastPanel\n                      forecast={forecast}", "{activeForecast ? (\n                    <ForecastPanel\n                      forecast={activeForecast}")

if result == source[start:end]:
    raise SystemExit('result surface was not changed')
if '{forecast ? (' in result:
    raise SystemExit('unscoped forecast conditional remains in result surface')
source = source[:start] + result + source[end:]
path.write_text(source)
