<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import pDebounce from "p-debounce";

import { FilterMatchMode, FilterOperator, FilterService } from "@primevue/core/api";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable, {
	type DataTableFilterEvent,
	type DataTableFilterMetaData,
	type DataTableOperatorFilterMetaData
} from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputGroup from "primevue/inputgroup";
import InputGroupAddon from "primevue/inputgroupaddon";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";

import AppGoogleLink from "./AppGoogleLink.vue";
import MapDialog from "./MapDialog.vue";
import { geocodingService } from "@/geocoding";
import { favouritesService } from "@/favourites";

import type {
	DaysContentPermitInfo,
	DocumentsEntity,
	DocumentsEntity2,
	PermitsEntity,
	PermitsEntityDB,
	PermitsInfo,
	ProgressSectionsEntity,
	RelatedPermit,
	ViewedPermitInfoDB
} from "@/types/Permits";

import rawPermitInfo from "@/permitInfo.json";
const permitInfo = rawPermitInfo as PermitsInfo;

import rawDaysWithInfo from "@/daysContentPermitInfo.json";
const daysWithInfo = rawDaysWithInfo as DaysContentPermitInfo;

import MultiSelect from "primevue/multiselect";
import Toast from "primevue/toast";

import { db } from "@/db";

import { getFormattedDate } from "@/utils";
import { Select } from "primevue";
import DatePicker from "primevue/datepicker";
import DebugDialog from "./DebugDialog.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();

// Register custom filter with PrimeVue FilterService
FilterService.register("customUnixDateIsFilter", (value: number | null, filter: Date | null) => {
	if (!filter || !value) return true;

	const { valueDayTime, filterDayTime } = unixDateParseFilterVals(value, filter);

	return valueDayTime === filterDayTime;
});
FilterService.register(
	"customUnixDateIsBeforeFilter",
	(value: number | null, filter: Date | null) => {
		if (!filter || !value) return true;

		const { valueDayTime, filterDayTime } = unixDateParseFilterVals(value, filter);

		return valueDayTime <= filterDayTime;
	}
);
FilterService.register(
	"customUnixDateIsAfterFilter",
	(value: number | null, filter: Date | null) => {
		if (!filter || !value) return true;

		const { valueDayTime, filterDayTime } = unixDateParseFilterVals(value, filter);

		return valueDayTime >= filterDayTime;
	}
);

function unixDateParseFilterVals(value: number, filter: Date) {
	const valueDate = new Date(value * 1000);

	// Compare dates by resetting time to start of day
	const valueDay = new Date(valueDate.getFullYear(), valueDate.getMonth(), valueDate.getDate());
	const filterDay = new Date(filter.getFullYear(), filter.getMonth(), filter.getDate());

	return { valueDayTime: valueDay.getTime(), filterDayTime: filterDay.getTime() };
}

// Define the filter structure
interface Filters {
	global: DataTableFilterMetaData;
	folderNumber: DataTableFilterMetaData;
	primaryStreetName: DataTableFilterMetaData;
	applicationType: DataTableFilterMetaData;
	status: DataTableFilterMetaData;
	city: DataTableFilterMetaData;
	applicationDate: DataTableOperatorFilterMetaData;
	lastUpdated: DataTableOperatorFilterMetaData;
	unviewedDocs?: {
		value: boolean | null;
		matchMode: string;
		constraint?: (value: boolean, filter: boolean | null) => boolean;
	};
}

const filters = ref<Filters>({
	global: { value: null, matchMode: FilterMatchMode.CONTAINS },
	folderNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
	primaryStreetName: { value: null, matchMode: FilterMatchMode.CONTAINS },
	applicationType: { value: null, matchMode: FilterMatchMode.IN },
	status: { value: null, matchMode: FilterMatchMode.EQUALS },
	city: { value: null, matchMode: FilterMatchMode.IN },
	applicationDate: {
		operator: FilterOperator.AND,
		constraints: [{ value: null, matchMode: "customUnixDateIsFilter" }]
	},
	lastUpdated: {
		operator: FilterOperator.AND,
		constraints: [{ value: null, matchMode: "customUnixDateIsFilter" }]
	}
});

const permitsList: PermitsEntity[] = permitInfo.permits;

const permitsViewedTodaySet = reactive(new Set<string>());
initPermitsViewedToday(permitsViewedTodaySet);

const viewedDocs = reactive(new Map<string, boolean>());
initViewedDocs(viewedDocs);

const viewedDocs2 = reactive(new Map<string, boolean>());
initViewedDocs2(viewedDocs2);

// Initialize favourites service
favouritesService.initialize();

const applicationTypes = ref(getApplicationTypes(permitsList));

function cloneObj<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
}

function getTodaysDate(): string {
	return getFormattedDate(new Date());
}

async function initViewedDocs(viewedDocs: Map<string, boolean>) {
	const dbClickedDocs = await db.clickedDocs.toArray();
	for (const dbClickedDoc of dbClickedDocs) {
		const mapKey = getViewedDocMapKey(dbClickedDoc);
		viewedDocs.set(mapKey, true);
	}
}

async function initViewedDocs2(viewedDocs2: Map<string, boolean>) {
	const dbClickedDocs2 = await db.clickedDocs2.toArray();
	for (const dbClickedDoc2 of dbClickedDocs2) {
		const mapKey = getViewedDocMapKey2(dbClickedDoc2);
		viewedDocs2.set(mapKey, true);
	}
}

async function initPermitsViewedToday(permitsViewedTodaySet: Set<string>) {
	// Clear todaysViewedPermits DB where date isn't today
	const today = getTodaysDate();
	await db.todaysViewedPermits.where("lastViewedDate").notEqual(today).delete();

	// Load DB todaysViewedPermits into permitsViewedTodaySet ref
	const viewedToday = await db.todaysViewedPermits.where("lastViewedDate").equals(today).toArray();
	for (const permitView of viewedToday) {
		permitsViewedTodaySet.add(getPermitKey(permitView));
	}
}

function getPermitKey(permit: ViewedPermitInfoDB | PermitsEntity) {
	const permitViewKey = `${permit.city}-${permit.folderNumber}`;
	return permitViewKey;
}

function getApplicationTypes(permitApplications: PermitsEntity[]): string[] {
	const set = new Set<string>();
	for (const application of permitApplications) {
		set.add(application.applicationType);
	}
	const applicationTypes = [...set.values()];
	return applicationTypes;
}

const permitMap = ref(createPermitMap(permitsList));

const relatedPermits = ref(createRelatedPermits(permitsList));

const statuses = ref(getStatuses(permitsList));

function getStatuses(permitApplications: PermitsEntity[]): string[] {
	const set = new Set<string>();
	for (const application of permitApplications) {
		set.add(application.status);
	}
	const statuses = [...set.values()];
	return statuses;
}

const cities = ref(getCities(permitsList));

function getCities(permitApplications: PermitsEntity[]): string[] {
	const set = new Set<string>();
	for (const application of permitApplications) {
		set.add(application.city);
	}
	const cities = [...set.values()];
	return cities;
}

/**
 * Formats a Unix timestamp (in seconds) to a readable date string in local format
 * @param unixDate Unix timestamp in seconds
 */
const formatDate = (unixDate?: number | null): string => {
	if (!unixDate) {
		return "";
	}
	return new Date(unixDate * 1000).toString().split(" ").slice(0, 4).slice(1).join(" ");
};

const isUnixDate = (unixDate: any): boolean => {
	if (!unixDate || typeof unixDate !== "number") {
		return false;
	}
	// Date range roughly 1995-2050
	return unixDate >= 800000000 && unixDate <= 2500000000;
};

function createPermitMap(permitApplications: PermitsEntity[]): Map<string, PermitsEntity> {
	const permitMap = new Map<string, PermitsEntity>();

	for (const application of permitApplications) {
		const id = getApplicationID(application);
		permitMap.set(id, application);
	}
	return permitMap;
}

function createRelatedPermits(permitApplications: PermitsEntity[]): Set<string> {
	const relatedPermits = new Set<string>();

	for (const application of permitApplications) {
		for (const relatedPermit of application.relatedPermits || []) {
			const id = createApplicationID(application.city, relatedPermit.relatedPermitID);
			relatedPermits.add(id);
		}
	}
	return relatedPermits;
}

function permitExistByID(city: string, folderNumber: string) {
	const id = createApplicationID(city, folderNumber);
	if (permitMap.value.get(id)) {
		return "exists";
	}
	if (relatedPermits.value.has(id)) {
		return "related";
	}
	return "";
}

function getApplicationID(application: PermitsEntity): string {
	return createApplicationID(application.city, application.folderNumber);
}

function createApplicationID(city: string, folderNumber: string): string {
	return city + "-" + folderNumber;
}

function getApplicationByID(city: string, folderNumber: string): PermitsEntity | undefined {
	const id = createApplicationID(city, folderNumber);
	const permit = permitMap.value.get(id);
	return permit;
}

async function saveLastViewedPermit(permitData: PermitsEntityDB) {
	return db.transaction("rw", db.lastSeenPermits, async () => {
		// Add or update the permit data

		//  1. Check if 'current db' permit exists
		//  1a) 'current db' Exists True: Check if matches one being saved
		//  1 a i) Matches = true: do nothing
		//  1 b ii) Matches = false. Save previous 'current' to 'previous'. Save given to 'current'.
		//  1b) 'current db' does not exist: save to db
		// Retrieve 'previous' version and use for permit view comparison

		const result = await db.lastSeenPermits
			.where({
				dbVersion: "current",
				city: permitData.city,
				folderNumber: permitData.folderNumber
			})
			.toArray();
		if (result.length === 0) {
			// 1b) 'current db' does not exist: save to db
			const toSave = cloneObj(permitData);
			toSave.dbVersion = "current";
			return await db.lastSeenPermits.add(toSave);
		}
		const currentPermit = result[0];
		if (!currentPermit) {
			throw new Error("Unexpected missing current permit");
		}
		//  1a) 'current db' Exists True: Check if matches one being saved
		// We could do a hash instead of update time, but this should be good enough for now
		if (permitData.lastUpdated === currentPermit.lastUpdated) {
			//  1 a i) Matches = true: do nothing
			return;
		}
		//  1 b ii) Matches = false. Save previous 'current' to 'previous'. Save given to 'current'.
		// Delete DB versions of both previous and current
		await db.lastSeenPermits
			.where({
				city: permitData.city,
				folderNumber: permitData.folderNumber
			})
			.delete();

		// Save new previous
		const newPrevious = cloneObj(currentPermit);
		newPrevious.dbVersion = "previous";
		await db.lastSeenPermits.add(newPrevious);

		// Save new current
		const newCurrent = cloneObj(permitData);
		newCurrent.dbVersion = "current";
		return await db.lastSeenPermits.add(newCurrent);
	});
}

async function clickedDoc(document: DocumentsEntity, permit: PermitsEntity) {
	await db.clickedDocs.put({
		docName: document.docName,
		docURL: document.docURL
	});
	const mapKey = getViewedDocMapKey(document);
	viewedDocs.set(mapKey, true);

	const docEntity2: DocumentsEntity2 = {
		city: permit.city,
		permitID: permit.folderNumber,
		docName: document.docName,
		docURL: document.docURL
	};
	await db.clickedDocs2.put(docEntity2);
	const mapKey2 = getViewedDocMapKey2(docEntity2);
	viewedDocs2.set(mapKey2, true);
}

async function clearDocs() {
	if (!permit.value) return;

	await Promise.all(permit.value.documents.map((document) => clickedDoc(document, permit.value!)));
}

async function markViewed() {
	if (!permit.value) return;

	// Run clearDocs and geocoding simultaneously
	await Promise.all([clearDocs(), geocodingService.geocodeAndCachePermit(permit.value)]);

	// Close the dialog after both operations complete
	permitDialogVisible.value = false;
}

const dateRetrieved = ref(permitInfo.dateRetrieved);
const permitApplications = ref(createPermitApplications(permitsList, daysWithInfo));

const showOnlyUnviewedDocs = ref<string | null>(null);
const showOnlyFavourites = ref(false);
const showMapDialog = ref(false);
const showDebugDialog = ref(false);
const dateFilterModeOptions = [
	{ label: "Equals", value: "customUnixDateIsFilter" },
	{ label: "Before", value: "customUnixDateIsBeforeFilter" },
	{ label: "After", value: "customUnixDateIsAfterFilter" }
];

const viewedDocsFilterOptions = [
	{ label: "Unviewed1", value: "unviewed1" },
	{ label: "Unviewed2", value: "unviewed2" },
	{ label: "Unviewed1 and NOT Unviewed2", value: "unviewed1_not2" },
	{ label: "NOT Unviewed1 and Unviewed2", value: "not1_unviewed2" },
	{ label: "Both Unviewed1 and Unviewed2", value: "both_unviewed" },
	{ label: "Neither Unviewed1 or Unviewed2", value: "neither_unviewed" }
];

const filteredPermitApplications = computed(() => {
	let filtered = permitApplications.value;

	// Filter by favourites if enabled
	if (showOnlyFavourites.value) {
		filtered = filtered.filter((permit) => favouritesService.isPermitFavourite(permit));
	}

	// Filter by unviewed docs if enabled
	if (!showOnlyUnviewedDocs.value) {
		return filtered;
	}

	return filtered.filter((permit) => {
		// Check if permit has any documents
		if (permit.documents.length === 0) {
			return false;
		}
		// Count unviewed docs in both sets
		let hasUnviewed1 = false;
		let hasUnviewed2 = false;
		let hasUnviewed1_not2 = false;
		let hasNot1_unviewed2 = false;
		let hasBothUnviewed = false;

		for (const permitDoc of permit.documents) {
			const docMapKey = getViewedDocMapKey(permitDoc);
			const docViewed1 = viewedDocs.has(docMapKey);

			const docEntity2: DocumentsEntity2 = {
				city: permit.city,
				permitID: permit.folderNumber,
				docName: permitDoc.docName,
				docURL: permitDoc.docURL
			};
			const docMapKey2 = getViewedDocMapKey2(docEntity2);
			const docViewed2 = viewedDocs2.has(docMapKey2);

			if (!docViewed1) {
				hasUnviewed1 = true;
			}
			if (!docViewed2) {
				hasUnviewed2 = true;
			}

			if (!docViewed1 && docViewed2) {
				hasUnviewed1_not2 = true;
			}
			if (!docViewed2 && docViewed1) {
				hasNot1_unviewed2 = true;
			}

			if (!docViewed1 && !docViewed2) {
				hasBothUnviewed = true;
			}
		}

		// Apply filter based on selected mode
		switch (showOnlyUnviewedDocs.value) {
			case "unviewed1":
				return hasUnviewed1;
			case "unviewed2":
				return hasUnviewed2;
			case "unviewed1_not2":
				return hasUnviewed1_not2;
			case "not1_unviewed2":
				return hasNot1_unviewed2;
			case "both_unviewed":
				return hasBothUnviewed;
			case "neither_unviewed":
				return !hasUnviewed1 && !hasUnviewed2;
			default:
				return true;
		}
	});
});

// Ref to store the filtered permits from DataTable's filter event
const visiblePermits = ref<typeof filteredPermitApplications.value>([]);

// Handle DataTable filter event to update the filtered permits ref
const onFilter = (event: DataTableFilterEvent) => {
	visiblePermits.value = event.filteredValue || [];
};

const globalFilter = ref();

// Permit Dialog
const permit = ref<PermitsEntity | null>(null);
const previousPermit = ref<PermitsEntity | null>(null);
const permitDialogVisible = ref(false);
const isPermitFavourite = ref(false);

// Computed property to check if permit should show "(Permitted)" text
const showPermittedText = computed(() => {
	if (!permit.value || !permit.value.progressSections.length) {
		return false;
	}

	const lastTask = permit.value.progressSections[permit.value.progressSections.length - 1];
	return lastTask?.taskType === "Development Permit Issued" && lastTask?.endDate !== null;
});

const viewPermit = async (permitData: PermitsEntity) => {
	permit.value = { ...permitData };
	permitDialogVisible.value = true;
	isPermitFavourite.value = favouritesService.isPermitFavourite(permitData);
	await saveLastViewedPermit(cloneObj(permitData));
	previousPermit.value = await getPreviousPermit(permitData);

	const permitViewKey = `${permitData.city}-${permitData.folderNumber}`;
	permitsViewedTodaySet.add(permitViewKey);
	db.todaysViewedPermits.put({
		city: permitData.city,
		folderNumber: permitData.folderNumber,
		lastViewedDate: getTodaysDate()
	});
};

async function getPreviousPermit(permitData: PermitsEntity): Promise<PermitsEntity> {
	const result = await db.lastSeenPermits
		.where({
			dbVersion: "previous",
			city: permitData.city,
			folderNumber: permitData.folderNumber
		})
		.toArray();
	const prevPermit = result[0];
	if (!prevPermit) {
		// Always have a previous version, even if it's the exact same
		return permitData;
	}
	return prevPermit;
}

function onDialogHide() {
	router.push({ name: "home" });
}

const setViewedPermit = pDebounce(setViewedPA, 1000, { before: true });

// fetch the user information when params change
watch(
	() => route.params.city,
	async (city) => {
		if (!city) {
			return;
		}
		setViewedPermit(city as string, route.params.permitID as string);
	},
	{
		immediate: true
	}
);
watch(
	() => route.params.permitID,
	async (permitID) => {
		if (!permitID) {
			return;
		}
		setViewedPermit(route.params.city as string, permitID as string);
	}
);

function setViewedPA(city: string, permitID: string) {
	const permit = getApplicationByID(city, permitID);
	if (permit) {
		viewPermit(permit);
	} else {
		nextTick(() => {
			showNoPAToast();
		});
	}
}

function createPermitApplications(
	permits: PermitsEntity[],
	daysWithInfo: DaysContentPermitInfo
): PermitsEntity[] {
	// Combine the daysWith information into the permits
	// They are separated only to make nicer diffs :)
	for (const pa of permits) {
		if (typeof pa.withDistrictDays === "number") {
			continue;
		}
		const daysWith = getDaysWith(pa, daysWithInfo);
		pa.withDistrictDays = daysWith.withDistrictDays;
		pa.withApplicantDays = daysWith.withApplicantDays;
	}
	return permits;
}

function getDaysWith(
	pa: PermitsEntity,
	daysWithInfo: DaysContentPermitInfo
): { withDistrictDays: number | null; withApplicantDays: number | null } {
	const dwCity = daysWithInfo[pa.city];
	if (!dwCity) {
		return { withDistrictDays: null, withApplicantDays: null };
	}
	const dwFolder = dwCity[pa.folderNumber];
	if (!dwFolder) {
		return { withDistrictDays: null, withApplicantDays: null };
	}
	return dwFolder;
}

const getPermitApplicationLink = (pa: PermitsEntity): string => {
	return getPermitApplicationLinkByID(pa.city, pa.folderNumber, pa);
};

const getPermitApplicationLinkByID = (
	city: string,
	permitID: string,
	pa?: PermitsEntity
): string => {
	if (city === "Saanich") {
		return (
			"https://online.saanich.ca/Tempest/OurCity/Prospero/Details.aspx?folderNumber=" + permitID
		);
	} else if (city === "Victoria") {
		return (
			"https://tender.victoria.ca/webapps/ourcity/Prospero/Details.aspx?folderNumber=" + permitID
		);
	} else if (city === "Oak Bay") {
		return (
			"https://onlineservice.oakbay.ca/WebApps/OurCity/Prospero/Details.aspx?folderNumber=" +
			permitID
		);
	} else if (city === "Central Saanich") {
		return (
			"https://www.mycentralsaanich.ca/TempestLive/OURCITY/Prospero/Details.aspx?folderNumber=" +
			permitID
		);
	} else if (city === "Colwood") {
		return `https://services.colwood.ca/TLive/OurCity/Prospero/Details.aspx?folderNumber=${permitID}`;
	} else if (city === "Esquimalt") {
		return getEsquimaltLinkByID(permitID);
	} else if (city === "View Royal") {
		return getViewRoyalLinkByID(permitID);
	} else if (city === "Sidney" && pa) {
		return getSidneyPermitLink(pa);
	}
	return "";
};

function getEsquimaltLinkByID(permitID: string) {
	const match = permitID.match(/^[A-Z]+/);
	if (!match) {
		toast.add({ severity: "error", summary: "Cannot get link for Esquimalt permit " + permitID });
		return "";
	}
	const prefix = match[0];
	let baseUrl = "";
	switch (prefix) {
		case "DVP":
			baseUrl =
				"https://www.esquimalt.ca/business-development/development-tracker/development-variance-permit-applications";
			break;
		case "RZ":
			baseUrl =
				"https://www.esquimalt.ca/business-development/development-tracker/rezoning-applications";
			break;
		case "DP":
			baseUrl =
				"https://www.esquimalt.ca/business-development/development-tracker/development-permit-applications";
			break;
	}
	if (!baseUrl) {
		console.error(prefix, permitID);
		toast.add({ severity: "error", summary: "Cannot get link for Esquimalt permit " + permitID });
		return "";
	}
	const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D");
	return fullUrl;
}

function getViewRoyalLinkByID(permitID: string) {
	const match = permitID.match(/^[A-Z]+/);
	if (!match) {
		toast.add({ severity: "error", summary: "Cannot get link for View Royal permit " + permitID });
		return "";
	}
	const prefix = match[0];
	let baseUrl = "";
	switch (prefix) {
		case "DVP":
			baseUrl =
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-tracker/development-variance-permit-applications.html";
			break;
		case "REZ":
			baseUrl =
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-tracker/rezoning-applications.html";
			break;
		case "DP":
			baseUrl =
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-tracker/development-permit-applications.html";
			break;
	}
	if (!baseUrl) {
		console.error(prefix, permitID);
		toast.add({ severity: "error", summary: "Cannot get link for View Royal permit " + permitID });
		return "";
	}

	const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D");
	return fullUrl;
}

function getSidneyPermitLink(pa: PermitsEntity) {
	// Sidney doesn't have permit IDs, and only one page for permits
	let baseUrl = "https://www.sidney.ca/planning-building/community-planning/development/";

	const fullUrl =
		baseUrl + "#:~:text=" + encodeURIComponent(pa.primaryStreetName).replace(/-/g, "%2D");
	return fullUrl;
}

function showNoPAToast() {
	toast.add({ severity: "error", summary: "No such permit application" });
}

function versionDiffClass(
	property: keyof PermitsEntityDB,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): Array<String | null> {
	return [permit[property] !== previousPermit[property] ? "permitDataChanged" : null];
}

function documentLinkClass(
	document: DocumentsEntity,
	index: number,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): Array<String | null> {
	const docLinkClasses = versionDiffDocumentClass(index, permit, previousPermit);
	const viewedDocMapKey = getViewedDocMapKey(document);
	const hasViewedDoc = viewedDocs.has(viewedDocMapKey);

	const docEntity2: DocumentsEntity2 = {
		city: permit.city,
		permitID: permit.folderNumber,
		docName: document.docName,
		docURL: document.docURL
	};
	if (hasViewedDoc) {
		docLinkClasses.push("viewedDoc");
	} else {
		docLinkClasses.push("notViewedDoc");
	}
	const viewedDocMapKey2 = getViewedDocMapKey2(docEntity2);
	const hasViewedDoc2 = viewedDocs2.has(viewedDocMapKey2);
	if (hasViewedDoc2) {
		docLinkClasses.push("viewedDoc2");
	} else {
		docLinkClasses.push("notViewedDoc2");
	}
	return docLinkClasses;
}

function getViewedDocMapKey(document: DocumentsEntity) {
	return document.docName + "|" + document.docURL;
}

function getViewedDocMapKey2(document: DocumentsEntity2) {
	return document.permitID + "|" + document.docName;
}

function getDocNameFromURL(docURL: string): string {
	const unknownName = "<No Name>";
	const lastSlashIdx = docURL.lastIndexOf("/");
	if (lastSlashIdx < 0) {
		return unknownName;
	}
	let docNamePath = docURL.substring(lastSlashIdx + 1);
	let docName = docNamePath.split(".")[0];
	if (!docName) {
		return unknownName;
	}
	return decodeURI(docName);
}

function versionDiffDocumentClass(
	index: number,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): string[] {
	const permitDoc = permit.documents[index];
	if (!permitDoc) {
		return ["permitDataNew"];
	}
	const previousPermitDoc = previousPermit.documents[index];
	if (
		!previousPermitDoc ||
		permitDoc.docName !== previousPermitDoc.docName ||
		permitDoc.docURL !== previousPermitDoc.docURL
	) {
		return ["permitDataChanged"];
	}
	return [];
}

function versionDiffAddressClass(
	index: number,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): Array<String | null> {
	if (index >= previousPermit.addresses.length) {
		return ["permitDataNew"];
	}
	if (permit.addresses[index] !== previousPermit.addresses[index]) {
		return ["permitDataChanged"];
	}
	return [];
}

function versionDiffProgressClass(
	index: number,
	property: keyof ProgressSectionsEntity,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): Array<String | null> {
	if (index >= previousPermit.progressSections.length) {
		// The whole progress row will be styled differently if it's new
		return [];
	}
	const permitProgressVal = permit.progressSections[index]?.[property];
	const previousPermitProgressVal = previousPermit.progressSections[index]?.[property];
	return [permitProgressVal !== previousPermitProgressVal ? "permitDataChanged" : null];
}

function versionDiffProgressTitle(
	index: number,
	property: keyof ProgressSectionsEntity,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): string | undefined {
	if (index >= previousPermit.progressSections.length) {
		// The whole progress row will be styled differently if it's new
		return undefined;
	}
	const val = permit.progressSections[index]?.[property];
	const prevVal = previousPermit.progressSections[index]?.[property];
	if (val !== prevVal) {
		return diffTitleString(prevVal);
	}
	return undefined;
}

function diffTitleString(val: any): string {
	if (typeof val === "number" && isUnixDate(val)) {
		return formatDate(val);
	}
	return String(val);
}

function versionDiffTitle(
	property: keyof PermitsEntityDB,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): string | undefined {
	if (permit[property] !== previousPermit[property]) {
		const prevVal = previousPermit[property];
		return diffTitleString(prevVal);
	}
	return undefined;
}

function progressRowClass(progress: ProgressSectionsEntity): String {
	if (!permit.value || !previousPermit.value) {
		return "";
	}
	const rowIndex = getProgressRowIndex(progress, permit.value);
	if (rowIndex < 0) {
		return "";
	}
	if (rowIndex >= previousPermit.value.progressSections.length) {
		return "permitDataNewRow";
	}
	return "";
}

function relatedPermitRowClass(relatedPermit: RelatedPermit): String {
	if (!permit.value || !previousPermit.value || !previousPermit.value.relatedPermits) {
		return "";
	}
	const rowIndex = getRelatedPermitRowIndex(relatedPermit, permit.value);
	if (rowIndex < 0) {
		return "";
	}
	if (rowIndex >= previousPermit.value.relatedPermits.length) {
		return "permitDataNewRow";
	}
	return "";
}

function getProgressRowIndex(progress: ProgressSectionsEntity, permit: PermitsEntity): number {
	const progressJSON = JSON.stringify(progress);
	for (const [index, progressItem] of permit.progressSections.entries()) {
		if (progressJSON === JSON.stringify(progressItem)) {
			return index;
		}
	}
	return -1;
}

function getRelatedPermitRowIndex(relatedPermit: RelatedPermit, permit: PermitsEntity): number {
	if (!permit.relatedPermits) {
		return -1;
	}
	const relatedPermitJSON = JSON.stringify(relatedPermit);
	for (const [index, relatedPermitITem] of permit.relatedPermits.entries()) {
		if (relatedPermitJSON === JSON.stringify(relatedPermitITem)) {
			return index;
		}
	}
	return -1;
}

async function saveAllCurrent() {
	if (!window.confirm("Save all current?")) {
		return;
	}
	let count = 0;
	for (const permitApp of permitApplications.value) {
		// Last updated after Sep 01 2022
		if (permitApp.lastUpdated && permitApp.lastUpdated > 1662037847) {
			count++;
			await saveLastViewedPermit(permitApp);
		}
	}
	console.log(
		"Saved " +
			count.toString() +
			" applications out of " +
			permitApplications.value.length.toString()
	);
}

function rowClass(permit: PermitsEntity) {
	if (!permit.lastUpdated) {
		return undefined;
	}
	const viewedToday = permitsViewedTodaySet.has(getPermitKey(permit));
	if (viewedToday) {
		return undefined;
	}
	const permitDate = getFormattedDate(permit.lastUpdated);
	const todaysDate = getTodaysDate();
	if (permitDate === todaysDate) {
		return "notSeenToday";
	}
	return undefined;
}

async function toggleFavourite() {
	if (!permit.value) return;

	const newStatus = await favouritesService.togglePermitFavourite(permit.value);
	isPermitFavourite.value = newStatus;

	toast.add({
		severity: newStatus ? "success" : "info",
		summary: newStatus ? "Added to Favourites" : "Removed from Favourites",
		detail: `${permit.value.folderNumber} ${newStatus ? "added to" : "removed from"} favourites`,
		life: 2000
	});
}

function openDebugDialog() {
	showDebugDialog.value = true;
}

function onPermitFolderClicked(city: string, folderNumber: string) {
	// Close the map dialog
	showMapDialog.value = false;

	// Find the permit using existing getApplicationByID function
	const permit = getApplicationByID(city, folderNumber);

	if (permit) {
		// Open the permit dialog for this permit
		viewPermit(permit);
	} else {
		// Show error if permit not found
		toast.add({
			severity: "error",
			summary: "Permit not found",
			detail: `Could not find permit ${folderNumber} in ${city}`
		});
	}
}

// Global keyboard shortcut handler for the permit dialog
const handleKeyDown = (event: KeyboardEvent) => {
	// Only handle if the permit dialog is visible
	if (!permitDialogVisible.value) return;

	// Check if 'C' key is pressed (case insensitive)
	if ((event.key === "c" || event.key === "C") && !event.ctrlKey) {
		// Don't trigger if user is typing in an input field
		const target = event.target as HTMLElement;
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
			return;
		}

		event.preventDefault();
		markViewed();
	}
};

// Add event listener when component mounts
onMounted(() => {
	window.addEventListener("keydown", handleKeyDown);
});

// Remove event listener when component unmounts
onBeforeUnmount(() => {
	window.removeEventListener("keydown", handleKeyDown);
});
</script>

<template>
	<main>
		<DataTable
			:value="filteredPermitApplications"
			width="100%"
			v-model:filters="filters"
			:globalFilter="globalFilter"
			filterDisplay="menu"
			stripedRows
			:globalFilterFields="[
				'primaryStreetName',
				'applicant',
				'city',
				'applicationType',
				'status',
				'folderNumber',
				'status',
				'addresses',
				'purpose',
				'lastUpdated'
			]"
			:rowsPerPageOptions="[5, 10, 20, 50]"
			:rows="10"
			:rowClass="rowClass"
			paginator
			paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
			sortField="lastUpdated"
			:sortOrder="-1"
			currentPageReportTemplate="{first} to {last} of {totalRecords}"
			@filter="onFilter"
		>
			<template #header>
				<div class="flex justify-content-between align-items-start gap-3">
					<h2 @dblclick="openDebugDialog" class="mt-0">Permit Applications</h2>
					<div @dblclick="saveAllCurrent">Data retrieved on {{ formatDate(dateRetrieved) }}</div>
					<div class="flex align-items-center gap-3">
						<div class="flex align-items-center gap-2">
							<label for="filterUnviewedDocs">Filter by viewed docs:</label>
							<Select
								v-model="showOnlyUnviewedDocs"
								inputId="filterUnviewedDocs"
								:options="viewedDocsFilterOptions"
								optionLabel="label"
								optionValue="value"
								placeholder="All permits"
								:showClear="true"
								style="min-width: 250px"
							/>
						</div>
						<div class="flex align-items-center gap-2">
							<label for="filterFavourites">
								<i class="pi pi-star-fill" style="color: gold"></i>
								Favourites only:
							</label>
							<input
								type="checkbox"
								id="filterFavourites"
								v-model="showOnlyFavourites"
								style="width: 1.2rem; height: 1.2rem; cursor: pointer"
							/>
						</div>
						<Button
							@click="showMapDialog = true"
							icon="pi pi-map"
							label="Show Map"
							outlined
							size="small"
							:disabled="!visiblePermits.length"
						/>
					</div>
					<InputGroup style="width: 50vw; min-width: 250px">
						<InputGroupAddon>
							<i class="pi pi-search"></i>
						</InputGroupAddon>
						<InputText v-model="filters['global'].value" placeholder="Keyword Search" />
					</InputGroup>
				</div>
			</template>
			<Column :exportable="false" style="width: 60px; min-width: 60px; max-width: 60px">
				<template #body="{ data }: { data: PermitsEntity }">
					<router-link
						:to="{ name: 'view_permit', params: { city: data.city, permitID: data.folderNumber } }"
						><Button icon="pi pi-search" outlined rounded title="View Permit"
					/></router-link>
				</template>
			</Column>
			<Column
				field="folderNumber"
				filterField="folderNumber"
				header="ID"
				:sortable="true"
				style="max-width: 200px !important"
			>
				<template #filter="{ filterModel, filterCallback }">
					<InputText
						v-model="filterModel.value"
						type="text"
						@input="filterCallback()"
						class="w-full"
						placeholder="ID"
					/>
				</template>
				<template #body="{ data }: { data: PermitsEntity }">
					{{ data.folderNumber }}
				</template>
			</Column>
			<Column
				field="primaryStreetName"
				filterField="primaryStreetName"
				header="Primary Address"
				:sortable="true"
				style="width: 20%; max-width: 25em"
			>
				<template #filter="{ filterModel, filterCallback }">
					<InputText
						v-model="filterModel.value"
						type="text"
						@input="filterCallback()"
						class="p-column-filter"
						placeholder="Search by address"
					/>
				</template>
				<template #body="{ data }: { data: PermitsEntity }">
					<AppGoogleLink :address="data.primaryStreetName" :city="data.city" :permit="data" />
				</template>
			</Column>
			<Column
				field="city"
				header="City"
				:showFilterMatchModes="false"
				:sortable="true"
				style="width: 12%"
			>
				<template #filter="{ filterModel, filterCallback }">
					<MultiSelect
						@change="filterCallback()"
						v-model="filterModel.value"
						showClear
						:options="cities"
						placeholder="Any"
						:maxSelectedLabels="1"
					/>
				</template>
			</Column>
			<Column
				field="applicationType"
				header="Application Type"
				:sortable="true"
				:showFilterMatchModes="false"
				style="width: 18%"
			>
				<template #filter="{ filterModel, filterCallback }">
					<MultiSelect
						@change="filterCallback()"
						v-model="filterModel.value"
						display="comma"
						:options="applicationTypes"
						placeholder="Any"
						:maxSelectedLabels="1"
					/>
				</template>
				<template #body="{ data }: { data: PermitsEntity }">
					<span :title="data.cityApplicationType">{{ data.applicationType }}</span>
				</template>
			</Column>
			<Column
				field="status"
				header="Status"
				:sortable="true"
				:showFilterMatchModes="false"
				style="width: 10%"
			>
				<template #filter="{ filterModel, filterCallback }">
					<Select
						@change="filterCallback()"
						v-model="filterModel.value"
						:showClear="true"
						:options="statuses"
						placeholder="Any"
						:maxSelectedLabels="1"
					/>
				</template>
			</Column>
			<Column
				field="applicationDate"
				filterField="applicationDate"
				header="Application Date"
				:filterMatchModeOptions="dateFilterModeOptions"
				:sortable="true"
				:showClearButton="true"
				style="width: 12%; min-width: 100px; max-width: 150px"
			>
				<template #filter="{ filterModel, filterCallback }">
					<DatePicker
						v-model="filterModel.value"
						dateFormat="M dd yy"
						:showButtonBar="true"
						@input="filterCallback()"
						@date-select="filterCallback()"
						@clear-click="filterCallback()"
					/>
				</template>
				<template #body="{ data }: { data: PermitsEntity }">
					{{ formatDate(data.applicationDate) }}
				</template>
			</Column>
			<Column
				field="lastUpdated"
				filterField="lastUpdated"
				header="Last Updated"
				:filterMatchModeOptions="dateFilterModeOptions"
				:sortable="true"
				style="width: 12%; min-width: 100px; max-width: 150px"
			>
				<template #filter="{ filterModel, filterCallback }">
					<DatePicker
						v-model="filterModel.value"
						dateFormat="M dd yy"
						:showButtonBar="true"
						@input="filterCallback()"
						@date-select="filterCallback()"
						@clear-click="filterCallback()"
					/>
				</template>
				<template #body="{ data }: { data: PermitsEntity }">
					{{ formatDate(data.lastUpdated) }}
				</template>
			</Column>
		</DataTable>

		<Dialog
			v-if="permit && previousPermit"
			@after-hide="onDialogHide"
			v-model:visible="permitDialogVisible"
			:dismissableMask="true"
			:style="{ width: '90vw' }"
			:modal="true"
			class="p-fluid"
		>
			<template #header>
				<div class="flex align-items-center gap-3">
					<span class="font-bold text-xl">Permit Details</span>
					<Button
						:label="isPermitFavourite ? 'Unfavourite' : 'Favourite'"
						:icon="isPermitFavourite ? 'pi pi-star-fill' : 'pi pi-star'"
						@click="toggleFavourite"
						size="small"
						:severity="isPermitFavourite ? 'warning' : 'secondary'"
						outlined
					/>
					<Button
						label="Mark viewed"
						icon="pi pi-check"
						@click="markViewed"
						size="small"
						severity="success"
					/>
				</div>
			</template>
			<div class="grid">
				<div class="col-2 field">
					<label>Primary Address</label>
					<div>
						<AppGoogleLink
							:address="permit.primaryStreetName"
							:city="permit.city"
							:permit="permit"
							:class="versionDiffClass('primaryStreetName', permit, previousPermit)"
							:title="versionDiffTitle('primaryStreetName', permit, previousPermit)"
						/>
					</div>
				</div>
				<div class="col-2 field">
					<label>City</label>
					<div class="font-bold">{{ permit.city }}</div>
				</div>
				<div class="col-2 field">
					<label>Status</label>
					<div
						class="font-bold"
						:class="versionDiffClass('status', permit, previousPermit)"
						:title="versionDiffTitle('status', permit, previousPermit)"
					>
						{{ permit.status }}
						<span v-if="showPermittedText"> (Permitted)</span>
					</div>
				</div>
				<div class="col-2 field">
					<label>Application Type</label>
					<div class="font-bold" :title="permit.cityApplicationType">
						{{ permit.applicationType }}
					</div>
				</div>
				<div class="col-2 field">
					<label>Permit Identifier</label>
					<div class="font-bold">
						<a :href="getPermitApplicationLink(permit)" target="_blank">{{
							permit.folderNumber
						}}</a>
					</div>
				</div>
				<div class="col-2 field">
					<label>Application Date</label>
					<div
						class="font-bold"
						:class="versionDiffClass('applicationDate', permit, previousPermit)"
						:title="versionDiffTitle('applicationDate', permit, previousPermit)"
					>
						{{ formatDate(permit.applicationDate) }}
					</div>
				</div>
			</div>
			<div class="grid mt-3">
				<div class="col-2 field">
					<label>Addresses</label>
					<div class="font-bold">
						<div v-for="(address, index) in permit.addresses" :key="address">
							<AppGoogleLink
								:address="address"
								:city="permit.city"
								:permit="index === 0 ? permit : undefined"
								:class="versionDiffAddressClass(index, permit, previousPermit)"
							/>
						</div>
					</div>
				</div>
				<div class="col-2 field">
					<label>Applicant</label>
					<div
						class="font-bold"
						:class="versionDiffClass('applicant', permit, previousPermit)"
						:title="versionDiffTitle('applicant', permit, previousPermit)"
					>
						{{ permit.applicant }}
					</div>
				</div>
				<div class="col-2 field">
					<label>With Municipality Days</label>
					<div class="font-bold">
						{{ permit.withDistrictDays }}
					</div>
				</div>
				<div class="col-2 field">
					<label>With Applicant Days</label>
					<div class="font-bold">{{ permit.withApplicantDays }}</div>
				</div>
				<div class="col-2 field">
					<label>Last Updated</label>
					<div
						class="font-bold"
						:class="versionDiffClass('lastUpdated', permit, previousPermit)"
						:title="versionDiffTitle('lastUpdated', permit, previousPermit)"
					>
						{{ formatDate(permit.lastUpdated) }}
					</div>
				</div>
			</div>
			<div class="grid mt-3">
				<div class="col-5 field">
					<label>Purpose</label>
					<div
						class="purpose font-bold"
						:class="versionDiffClass('purpose', permit, previousPermit)"
						:title="versionDiffTitle('purpose', permit, previousPermit)"
					>
						{{ permit.purpose }}
					</div>
				</div>
				<div class="col-7 field docSection">
					<label>Documents</label>
					<Button
						icon="pi pi-check"
						class="clearDocs"
						@click="clearDocs"
						title="Set all documents as viewed"
						aria-label="Clear Docs"
						size="small"
						raised
					/>
					<div class="font-bold">
						<div v-for="(document, index) in permit.documents" :key="document.docName">
							<a
								:href="document.docURL"
								target="_blank"
								class="documentLink"
								:class="documentLinkClass(document, index, permit, previousPermit)"
								@click.left="clickedDoc(document, permit)"
								@click.right="clickedDoc(document, permit)"
								@click.middle="clickedDoc(document, permit)"
								>{{ document.docName || getDocNameFromURL(document.docURL) }}</a
							>
						</div>
						<div v-if="permit.documents.length === 0">No Documents Submitted</div>
					</div>
				</div>
				<div class="col-12 field">
					<label>Task Progress</label>
					<div>
						<DataTable stripedRows :value="permit.progressSections" :rowClass="progressRowClass">
							<Column field="taskType" header="Type">
								<template #body="{ data, index }">
									<span
										:class="versionDiffProgressClass(index, 'taskType', permit, previousPermit)"
										:title="versionDiffProgressTitle(index, 'taskType', permit, previousPermit)"
										>{{ data.taskType }}</span
									>
								</template>
							</Column>
							<Column field="taskDescription" header="Description">
								<template #body="{ data, index }">
									<span
										:class="
											versionDiffProgressClass(index, 'taskDescription', permit, previousPermit)
										"
										:title="
											versionDiffProgressTitle(index, 'taskDescription', permit, previousPermit)
										"
										>{{ data.taskDescription }}</span
									>
								</template>
							</Column>
							<Column field="startDate" header="Start Date">
								<template #body="{ data, index }">
									<span
										:class="versionDiffProgressClass(index, 'startDate', permit, previousPermit)"
										:title="versionDiffProgressTitle(index, 'startDate', permit, previousPermit)"
										>{{ formatDate(data.startDate) }}</span
									>
								</template>
							</Column>
							<Column field="endDate" header="End Date">
								<template #body="{ data, index }">
									<span
										:class="versionDiffProgressClass(index, 'endDate', permit, previousPermit)"
										:title="versionDiffProgressTitle(index, 'endDate', permit, previousPermit)"
										>{{ formatDate(data.endDate) }}</span
									>
								</template>
							</Column>
						</DataTable>
					</div>
				</div>
				<div v-if="permit.relatedPermits && permit.relatedPermits.length" class="col-12 field">
					<label>Related Permits</label>
					<div>
						<DataTable stripedRows :value="permit.relatedPermits" :rowClass="relatedPermitRowClass">
							<Column field="relatedPermitID" header="ID" style="width: 15em">
								<template #body="{ data: { relatedPermitID } }: { data: RelatedPermit }">
									<router-link
										v-if="permitExistByID(permit.city, relatedPermitID) === 'exists'"
										:to="{
											name: 'view_permit',
											params: { city: permit.city, permitID: relatedPermitID }
										}"
									>
										{{ relatedPermitID }}
									</router-link>
									<a
										v-else-if="permitExistByID(permit.city, relatedPermitID) === 'related'"
										target="_blank"
										:href="getPermitApplicationLinkByID(permit.city, relatedPermitID, permit)"
									>
										{{ relatedPermitID }}
									</a>
									<span v-else>{{ relatedPermitID }}</span>
								</template>
							</Column>
							<Column header="Status" style="width: 20em">
								<template #body="{ data: { relatedPermitID } }: { data: RelatedPermit }">
									<span v-if="getApplicationByID(permit.city, relatedPermitID)">
										{{ getApplicationByID(permit.city, relatedPermitID)?.status }}
									</span>
									<span v-else class="text-color-secondary">—</span>
								</template>
							</Column>
							<Column field="relatedPermitType" header="Type"></Column>
						</DataTable>
					</div>
				</div>
			</div>
		</Dialog>
		<MapDialog
			v-model:visible="showMapDialog"
			:permits="visiblePermits"
			@permit-folder-clicked="onPermitFolderClicked"
		/>
		<DebugDialog v-model:visible="showDebugDialog" />

		<Toast
			class="w-9"
			position="bottom-center"
			:pt="{
				summary: { class: 'text-xl' },
				text: { class: 'text-center text-red-500' }
			}"
		/>
	</main>
</template>
