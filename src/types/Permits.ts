export interface PermitsEntity {
  primaryStreetName: string;
  applicant: string;
  applicationType: string;
  folderNumber: string;
  applicationDate: number;
  addresses: string[];
  status: string;
  purpose: string;
  progressSections: ProgressSectionsEntity[];
  documents: DocumentsEntity[];
  withDistrictDays: number;
  withApplicantDays: number;
  lastUpdated: number;
  city: string;
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
