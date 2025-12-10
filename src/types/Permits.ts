export interface PermitsEntity {
	primaryStreetName: string;
	applicant: string;
	applicationType: string;
	cityApplicationType?: string;
	folderNumber: string;
	applicationDate: number | null;
	addresses: string[];
	status: string;
	purpose: string;
	progressSections: ProgressSectionsEntity[];
	documents: DocumentsEntity[];
	withDistrictDays?: number | null;
	withApplicantDays?: number | null;
	lastUpdated: number | null;
	city: string;
	relatedPermits?: RelatedPermit[];
}

export interface PermitsInfo {
	dateRetrieved: number;
	permits: PermitsEntity[];
}

export interface DaysContentPermitInfo {
	[municipality: string]: {
		[permitId: string]: {
			withDistrictDays: number;
			withApplicantDays: number;
		};
	};
}

export interface PermitsEntityDB extends PermitsEntity {
	dbVersion?: "previous" | "current";
}

export interface ViewedPermitInfoDB {
	city: string;
	folderNumber: string;
	lastViewedDate: string; // YYYY-MM-DD
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

export interface DocumentsEntity2 {
	city: string;
	permitID: string;
	docName: string;
	docURL: string;
}

export interface AddressLocation {
	address: string;
	lat: number;
	lng: number;
}
