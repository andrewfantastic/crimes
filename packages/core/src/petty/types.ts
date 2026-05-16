export type RepoPath = string;

export interface PettyLiteralHit {
  value: string;
  file: RepoPath;
  line: number;
  lineText: string;
  exportedConstant: boolean;
}

export interface PettyIndex {
  root: string;
  domainLiterals: Record<string, PettyLiteralHit[]>;
}
