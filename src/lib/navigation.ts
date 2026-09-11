export function vacancyResultUrl(analysisId: string, vacancyId: string) {
  if (!analysisId.trim() || !vacancyId.trim()) {
    throw new Error("Для открытия результата нужны разбор и вакансия.");
  }
  const query = new URLSearchParams({ analysisId, vacancyId });
  return `/vacancy?${query.toString()}`;
}
