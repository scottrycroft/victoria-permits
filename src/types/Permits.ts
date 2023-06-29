export interface PermitsEntity {
  primaryStreetName: string;
  applicant: string;
  applicationType: string;
  cityApplicationType?: string;
  folderNumber: string;
  applicationDate: number;
  addresses: string[];
  status: string;
  purpose: string;
  progressSections: ProgressSectionsEntity[];
  documents: DocumentsEntity[];
  withDistrictDays?: number | null;
  withApplicantDays?: number | null;
  lastUpdated: number;
  city: string;
  relatedPermits?: RelatedPermit[];
}

export interface RelatedPermit {
  relatedPermitID: string;
  relatedPermitType: string;
}

export interface ProgressSectionsEntity {
  taskDescription: string;
  taskType: string;
  startDate: number | null;
  endDate: number | null;
}

export interface DocumentsEntity {
  docName: string;
  docURL: string;
}
