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
import Tag from "primevue/tag";
import { useToast } from "primevue/usetoast";

import AppGoogleLink from "./AppGoogleLink.vue";
import MapDialog from "./MapDialog.vue";
import PermitId from "./PermitId.vue";
import { geocodingService } from "@/geocoding";
import { favouritesService } from "@/favourites";

import type {
	DocumentEntity,
	DaysContentPermitInfo,
	DocumentsEntity,
	PermitUrls,
	PermitsEntity,
	PermitsEntityDB,
	PermitsInfo,
	ProgressSectionsEntity,
	RelatedPermit,
	ViewedPermitInfoDB
} from "@/types/Permits";

import rawPermitInfo from "@/permitInfo.json";
const permitInfo = rawPermitInfo as PermitsInfo;
const permitUrls: PermitUrls = permitInfo.permitUrls || {};

import rawDaysWithInfo from "@/daysContentPermitInfo.json";
const daysWithInfo = rawDaysWithInfo as DaysContentPermitInfo;

import MultiSelect from "primevue/multiselect";
import Toast from "primevue/toast";

import { db } from "@/db";

import { getFormattedDate, displayFolderNumber } from "@/utils";
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
	minor: DataTableFilterMetaData;
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
	},
	minor: { value: null, matchMode: FilterMatchMode.EQUALS }
});

const permitsList: PermitsEntity[] = permitInfo.permits;

const permitsViewedTodaySet = reactive(new Set<string>());
initPermitsViewedToday(permitsViewedTodaySet);

const viewedDocs = reactive(new Map<string, boolean>());
initViewedDocs(viewedDocs);

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
	const clickedDocEntity: DocumentEntity = {
		city: permit.city,
		permitID: permit.folderNumber,
		docName: document.docName,
		docURL: document.docURL
	};
	await db.clickedDocs.put(clickedDocEntity);
	const mapKey = getViewedDocMapKey(clickedDocEntity);
	viewedDocs.set(mapKey, true);
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

const showOnlyUnviewedDocs = ref<boolean>(false);
const showOnlyFavourites = ref(false);
const showOnlyMinor = ref<boolean | null>(false);
const showOnlyApprovalStatus = ref<string | null>(null);
const showMapDialog = ref(false);
const showDebugDialog = ref(false);
const dateFilterModeOptions = [
	{ label: "Equals", value: "customUnixDateIsFilter" },
	{ label: "Before", value: "customUnixDateIsBeforeFilter" },
	{ label: "After", value: "customUnixDateIsAfterFilter" }
];

const filteredPermitApplications = computed(() => {
	let filtered = permitApplications.value;

	// Filter by favourites if enabled
	if (showOnlyFavourites.value) {
		filtered = filtered.filter((permit) => favouritesService.isPermitFavourite(permit));
	}

	// Filter by minor if enabled
	if (showOnlyMinor.value !== null) {
		filtered = filtered.filter((permit) => {
			if (showOnlyMinor.value === true) {
				return permit.minor === true;
			} else {
				return permit.minor !== true;
			}
		});
	}

	// Filter by approval status if enabled
	if (showOnlyApprovalStatus.value !== null) {
		filtered = filtered.filter((permit) => {
			if (showOnlyApprovalStatus.value === "undefined") {
				return !permit.approvalStatus;
			}
			return permit.approvalStatus === showOnlyApprovalStatus.value;
		});
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
		// Check if any document is unviewed
		for (const permitDoc of permit.documents) {
			const clickedDocEntity: DocumentEntity = {
				city: permit.city,
				permitID: permit.folderNumber,
				docName: permitDoc.docName,
				docURL: permitDoc.docURL
			};
			const docMapKey = getViewedDocMapKey(clickedDocEntity);
			if (!viewedDocs.has(docMapKey)) {
				return true;
			}
		}
		return false;
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
const showDeletedItems = ref(false);

const deletedDocuments = computed((): DocumentsEntity[] => {
	if (!permit.value || !previousPermit.value) return [];
	if (permit.value.lastUpdated === previousPermit.value.lastUpdated) return [];
	return previousPermit.value.documents.filter(
		(prevDoc) =>
			!permit.value!.documents.some(
				(doc) => doc.docName === prevDoc.docName && doc.docURL === prevDoc.docURL
			)
	);
});

const deletedProgressSections = computed((): ProgressSectionsEntity[] => {
	if (!permit.value || !previousPermit.value) return [];
	if (permit.value.lastUpdated === previousPermit.value.lastUpdated) return [];
	return previousPermit.value.progressSections.filter(
		(prev) =>
			!permit.value!.progressSections.some(
				(cur) => cur.taskDescription === prev.taskDescription && cur.taskType === prev.taskType
			)
	);
});

const hasDeletedItems = computed(
	() => deletedDocuments.value.length > 0 || deletedProgressSections.value.length > 0
);

type ProgressSectionDisplay = ProgressSectionsEntity & { _deleted?: true };

const progressSectionsToDisplay = computed((): ProgressSectionDisplay[] => {
	if (!permit.value) return [];
	if (!showDeletedItems.value) return permit.value.progressSections;
	return [
		...permit.value.progressSections,
		...deletedProgressSections.value.map((p) => ({ ...p, _deleted: true as const }))
	];
});

const viewPermit = async (permitData: PermitsEntity) => {
	permit.value = { ...permitData };
	permitDialogVisible.value = true;
	isPermitFavourite.value = favouritesService.isPermitFavourite(permitData);
	showDeletedItems.value = false;
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
	// Build folderNumberSearch for permits whose display differs from the raw value
	for (const pa of permits) {
		const display = displayFolderNumber(pa.city, pa.folderNumber);
		if (display !== pa.folderNumber) {
			pa.folderNumberSearch = pa.folderNumber + " " + display;
		} else {
			pa.folderNumberSearch = pa.folderNumber;
		}
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

/** Map of cities that have dedicated per-permit URLs (Details.aspx?folderNumber=) */
const dedicatedPermitUrlCities: Record<string, string> = {
	Saanich: "https://online.saanich.ca/Tempest/OurCity/Prospero/Details.aspx?folderNumber=",
	Victoria: "https://tender.victoria.ca/webapps/ourcity/Prospero/Details.aspx?folderNumber=",
	"Oak Bay":
		"https://onlineservice.oakbay.ca/WebApps/OurCity/Prospero/Details.aspx?folderNumber=",
	"Central Saanich":
		"https://www.mycentralsaanich.ca/TempestLive/OURCITY/Prospero/Details.aspx?folderNumber=",
	Colwood: "https://services.colwood.ca/TLive/OurCity/Prospero/Details.aspx?folderNumber="
};

const getPermitApplicationLink = (pa: PermitsEntity): string => {
	return getPermitApplicationLinkByID(pa.city, pa.folderNumber, pa);
};

const getPermitApplicationLinkByID = (
	city: string,
	permitID: string,
	pa?: PermitsEntity
): string => {
	// Cities with dedicated per-permit URLs
	const dedicatedBase = dedicatedPermitUrlCities[city];
	if (dedicatedBase) {
		return dedicatedBase + permitID;
	}

	// Use permitUrls from permitInfo.json for all other cities
	return getPermitUrlFromConfig(city, permitID, pa);
};

/**
 * Resolves a permit link using the permitUrls config from permitInfo.json.
 * Matches the permit ID prefix to find the right URL, or falls back to "*".
 * Appends #:~:text= with the permit ID if available, or the primary address otherwise.
 */
function getPermitUrlFromConfig(
	city: string,
	permitID: string,
	pa?: PermitsEntity
): string {
	const cityUrls = permitUrls[city];
	if (!cityUrls) {
		return "";
	}

	// Try to match a prefix from the permit ID (e.g. "DVP" from "DVP-00123")
	const baseUrl = resolveBaseUrl(cityUrls, permitID);
	if (!baseUrl) {
		console.error("No matching permitUrl for", city, permitID);
		toast.add({
			severity: "error",
			summary: "Cannot get link for " + city + " permit " + permitID
		});
		return "";
	}

	// Determine the text fragment: use permit ID if it looks like a real ID, otherwise use primary address
	const textFragment = getTextFragment(city, permitID, pa);
	if (!textFragment) {
		return baseUrl;
	}

	return baseUrl + "#:~:text=" + encodeURIComponent(textFragment).replace(/-/g, "%2D");
}

/**
 * Resolves the base URL from a city's URL config by matching the permit ID prefix.
 * If there's only a "*" wildcard, returns that. Otherwise tries to match the
 * alphabetic prefix of the permit ID to a key in the config.
 */
function resolveBaseUrl(
	cityUrls: Record<string, string>,
	permitID: string
): string | undefined {
	// If there's a wildcard and it's the only entry, use it directly
	if (cityUrls["*"]) {
		return cityUrls["*"];
	}

	// Extract the alphabetic prefix from the permit ID (e.g. "DVP" from "DVP-00123")
	const match = permitID.match(/^[A-Z]+/);
	if (match) {
		const prefix = match[0];
		if (cityUrls[prefix]) {
			return cityUrls[prefix];
		}
	}

	return undefined;
}

/**
 * Determines the text to use in the #:~:text= fragment.
 * Uses the permit ID if it looks like a real identifier, otherwise falls back to the primary address.
 * For Richmond, uses the display version (dashes replaced with spaces) and strips the
 * alphabetic prefix (e.g. "BLD") to match the page content.
 */
function getTextFragment(city: string, permitID: string, pa?: PermitsEntity): string {
	// If the permit ID looks like a real identifier (has alphanumeric content), use it
	if (permitID && /[A-Za-z0-9]/.test(permitID)) {
		let text = displayFolderNumber(city, permitID);
		if (city === "Richmond") {
			// Remove the leading alphabetic prefix (e.g. "BLD ") and trim
			text = text.replace(/^[A-Z]+\s*/, "").trim();
		}
		return text;
	}

	// Fall back to primary address
	if (pa?.primaryStreetName) {
		return pa.primaryStreetName;
	}

	return "";
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
	const clickedDocEntity: DocumentEntity = {
		city: permit.city,
		permitID: permit.folderNumber,
		docName: document.docName,
		docURL: document.docURL
	};
	const viewedDocMapKey = getViewedDocMapKey(clickedDocEntity);
	const hasViewedDoc = viewedDocs.has(viewedDocMapKey);
	if (hasViewedDoc) {
		docLinkClasses.push("viewedDoc");
	} else {
		docLinkClasses.push("notViewedDoc");
	}
	return docLinkClasses;
}

function getViewedDocMapKey(document: DocumentEntity) {
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
	if (index >= permit.progressSections.length) {
		// Deleted row appended at end — styling handled by row class
		return [];
	}
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
	if (index >= permit.progressSections.length) {
		// Deleted row appended at end — no tooltip needed
		return undefined;
	}
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

function progressRowClass(progress: ProgressSectionDisplay): String {
	if ((progress as ProgressSectionDisplay)._deleted) {
		return "permitDataDeletedRow";
	}
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
				'folderNumberSearch',
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
				<div class="flex flex-column gap-3">
					<!-- First Row: Title, Date, and Search -->
					<div class="flex justify-content-between align-items-center gap-3">
						<h2 @dblclick="openDebugDialog" class="mt-0 mb-0">Permit Applications</h2>
						<div @dblclick="saveAllCurrent" class="text-sm">
							Data retrieved on {{ formatDate(dateRetrieved) }}
						</div>
						<InputGroup style="width: 50vw; min-width: 250px">
							<InputGroupAddon>
								<i class="pi pi-search"></i>
							</InputGroupAddon>
							<InputText v-model="filters['global'].value" placeholder="Keyword Search" />
						</InputGroup>
					</div>

					<!-- Second Row: All Filters -->
					<div class="flex align-items-center gap-3 flex-wrap">
						<div class="flex align-items-center gap-2">
							<label for="filterUnviewedDocs">
								Unviewed docs only:
							</label>
							<input
								type="checkbox"
								id="filterUnviewedDocs"
								v-model="showOnlyUnviewedDocs"
								style="width: 1.2rem; height: 1.2rem; cursor: pointer"
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
						<div class="flex align-items-center gap-2">
							<label for="filterApprovalStatus">Approval status:</label>
							<Select
								v-model="showOnlyApprovalStatus"
								inputId="filterApprovalStatus"
								:options="[
									{ label: 'All', value: null },
									{ label: 'Undefined', value: 'undefined' },
									{ label: 'Approved', value: 'Approved' },
									{ label: 'Rejected', value: 'Rejected' },
									{ label: 'Superseded', value: 'Superseded' }
								]"
								optionLabel="label"
								optionValue="value"
								placeholder="All"
								style="min-width: 150px"
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
					<PermitId :permit="data" />
					<i
						v-if="favouritesService.isPermitFavourite(data)"
						class="pi pi-star-fill"
						style="color: gold; margin-right: 0.5rem"
					></i>
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
					<Tag v-if="permit.minor" value="Minor" severity="info" />
					<Tag v-if="permit.approvalStatus === 'Approved'" value="Approved" severity="success" />
					<Tag v-if="permit.approvalStatus === 'Rejected'" value="Rejected" severity="danger" />
					<Tag v-if="permit.approvalStatus === 'Superseded'" value="Superseded" severity="warn" />
					<Button
						v-if="hasDeletedItems"
						:label="showDeletedItems ? 'Hide Removed' : 'Show Removed'"
						:icon="showDeletedItems ? 'pi pi-eye-slash' : 'pi pi-eye'"
						@click="showDeletedItems = !showDeletedItems"
						size="small"
						severity="danger"
						outlined
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
						<a :href="getPermitApplicationLink(permit)" target="_blank">
							<PermitId :permit="permit" />
						</a>
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
						{{ permit.applicant || '\u00A0' }}
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
						<template v-if="showDeletedItems">
							<a
								v-for="document in deletedDocuments"
								:key="'deleted-' + document.docName"
								:href="document.docURL"
								class="documentLink deletedItem"
								:title="document.docURL"
								>{{ document.docName || getDocNameFromURL(document.docURL) }}</a
							>
						</template>
						<div v-if="permit.documents.length === 0">No Documents Submitted</div>
					</div>
				</div>
				<div class="col-12 field">
					<label>Task Progress</label>
					<div>
						<DataTable stripedRows :value="progressSectionsToDisplay" :rowClass="progressRowClass">
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
										<PermitId :city="permit.city" :folderNumber="relatedPermitID" />
									</router-link>
									<a
										v-else-if="permitExistByID(permit.city, relatedPermitID) === 'related'"
										target="_blank"
										:href="getPermitApplicationLinkByID(permit.city, relatedPermitID, permit)"
									>
										<PermitId :city="permit.city" :folderNumber="relatedPermitID" />
									</a>
									<PermitId v-else :city="permit.city" :folderNumber="relatedPermitID" />
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
		<DebugDialog v-model:visible="showDebugDialog" v-model:showOnlyMinor="showOnlyMinor" />

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
