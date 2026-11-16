export function collectGlobalHistoryCoverageIssues(report) {
  if(!report)return [];
  if(report.fullCoverageCertified===true)return [];
  return [{severity:report.readErrors?.length?'error':'warning',source:'history-coverage',
    type:'global_history_coverage_unresolved',message:'Global historical coverage has unresolved gaps or an unverified provider baseline.',
    details:{dayKey:report.dayKey,gaps:report.metrics?.gaps??null,readErrors:report.readErrors?.length??0,
      expectedProviderBaseline:report.expectedBaseline?.externalProviderCompleteness,
      artifact:`data/history-coverage/${report.dayKey}/after.json`}}];
}
