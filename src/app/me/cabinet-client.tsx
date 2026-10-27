// Shared data contract for the cabinet view. The screen itself lives in cabinet-view.tsx.
export type CabItem = {
  id: string;
  personaName: string;
  img: string;
  verdictTitle: string;
  score: number;
  createdAt: string;
  responsibilities: number;
  achievements: number;
  unproven: number;
  filename: string;
  resumeId: string;
  afterScore: number | null;
  hasImprovement: boolean;
};

export type CabinetPackage = {
  active: boolean;
  matchesRemaining: number;
  rechecksRemaining: number;
  improvementUsed: boolean;
  adaptationUsed: boolean;
};

export type CabDocument = { id: string; kind: "improvement" | "adaptation"; analysisId: string; resumeId: string; title: string; detail: string; updatedAt: string; href: string };
export type CabUpload = { id: string; filename: string; createdAt: string; href: string; analysed: boolean };
export type CabDraftTarget = { analysisId: string; vacancyId: string; vacancyTitle: string };
