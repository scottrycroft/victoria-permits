<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";

import pDebounce from 'p-debounce';

import { FilterMatchMode } from "primevue/api";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import { useToast } from "primevue/usetoast";

import AppGoogleLink from "./AppGoogleLink.vue";

import type {
	PermitsEntity,
	PermitsEntityDB,
	RelatedPermit,
	ProgressSectionsEntity
} from "@/types/Permits";

import permitInfo from "@/permitInfo.json";
import daysWithInfo from "@/daysContentPermitInfo.json";

import MultiSelect from "primevue/multiselect";
import Dropdown from "primevue/dropdown";
import Toast from "primevue/toast";

import { db } from "../db";

const route = useRoute();
const router = useRouter();
const toast = useToast();

const filters = ref({
	global: { value: null, matchMode: FilterMatchMode.CONTAINS },
	folderNumber: { value: null, matchMode: FilterMatchMode.CONTAINS },
	primaryStreetName: { value: null, matchMode: FilterMatchMode.CONTAINS },
	applicationType: { value: null, matchMode: FilterMatchMode.IN },
	status: { value: null, matchMode: FilterMatchMode.EQUALS },
	city: { value: null, matchMode: FilterMatchMode.IN }
});

const permitsList: PermitsEntity[] = permitInfo.permits as PermitsEntity[];

const applicationTypes = ref(getApplicationTypes(permitsList));

function cloneObj<T>(obj: T): T {
	return JSON.parse(JSON.stringify(obj));
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

const dateRetrieved = ref(permitInfo.dateRetrieved);
const permitApplications = ref(createPermitApplications(permitsList, daysWithInfo));

const globalFilter = ref();

// Permit Dialog
const permit = ref<PermitsEntity | null>(null);
const previousPermit = ref<PermitsEntity | null>(null);
const permitDialogVisible = ref(false);
const viewPermit = async (permitData: PermitsEntity) => {
	permit.value = { ...permitData };
	permitDialogVisible.value = true;
	await saveLastViewedPermit(cloneObj(permitData));
	previousPermit.value = await getPreviousPermit(permitData);
};

async function getPreviousPermit(permitData: PermitsEntity): Promise<PermitsEntity> {
	const result = await db.lastSeenPermits
		.where({
			dbVersion: "previous",
			city: permitData.city,
			folderNumber: permitData.folderNumber
		})
		.toArray();
	if (result.length === 0) {
		// Always have a previous version, even if it's the exact same
		return permitData;
	}
	return result[0];
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

function createPermitApplications(permits: PermitsEntity[], daysWithInfo: any): PermitsEntity[] {
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
	daysWithInfo: any
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

const getPermitApplicationLinkByID = (city: string, permitID: string, pa?: PermitsEntity): string => {
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
		return getColwoodLinkByID(permitID);
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
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/development-variance-permit-applications.html";
			break;
		case "REZ":
			baseUrl =
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/rezoning-applications.html";
			break;
		case "DP":
			baseUrl =
				"https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/development-permit-applications.html";
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

function getColwoodLinkByID(permitID: string) {
	const match = permitID.match(/^[A-Z]+/);
	if (!match) {
		toast.add({ severity: "error", summary: "Cannot get link for Colwood permit " + permitID });
		return "";
	}
	let baseUrl = "https://www.colwood.ca/city-services/development-services/development-activity";

	const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D");
	return fullUrl;
}

function getSidneyPermitLink(pa: PermitsEntity) {
	// Sidney doesn't have permit IDs, and only one page for permits
	let baseUrl = "https://www.sidney.ca/planning-building/community-planning/development/";

	const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(pa.primaryStreetName).replace(/-/g, "%2D");
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

function versionDiffDocumentClass(
	index: number,
	permit: PermitsEntityDB,
	previousPermit: PermitsEntityDB
): Array<String | null> {
	if (index >= previousPermit.documents.length) {
		return ["permitDataNew"];
	}
	const permitDoc = permit.documents[index];
	const previousPermitDoc = previousPermit.documents[index];
	if (
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
	const permitProgressVal = permit.progressSections[index][property];
	const previousPermitProgressVal = previousPermit.progressSections[index][property];
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
	const val = permit.progressSections[index][property];
	const prevVal = previousPermit.progressSections[index][property];
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
	if(!window.confirm("Save all current?")) {
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
</script>

<template>
	<main>
		<DataTable
			:value="permitApplications"
			width="100%"
			v-model:filters="filters"
			:globalFilter="globalFilter"
			filterDisplay="row"
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
			:rows="5"
			paginator
			paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
			sortField="applicationDate"
			:sortOrder="-1"
			currentPageReportTemplate="{first} to {last} of {totalRecords}"
		>
			<template #header>
				<div class="flex justify-content-between">
					<h2 class="mt-0">Permit Applications</h2>
					<div @dblclick="saveAllCurrent">Data retrieved on {{ formatDate(dateRetrieved) }}</div>
					<span class="p-input-icon-left">
						<i class="pi pi-search" />
						<InputText
							v-model="filters['global'].value"
							placeholder="Keyword Search"
							style="width: 50vw; min-width: 250px"
						/>
					</span>
				</div>
			</template>
			<Column :exportable="false" class="w-1">
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
				class="w-1"
				:showFilterMenu="false"
			>
				<template #filter="{ filterModel, filterCallback }">
					<InputText
						v-model="filterModel.value"
						type="text"
						@input="filterCallback()"
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
				class="w-2"
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
					<AppGoogleLink :address="data.primaryStreetName" />
				</template>
			</Column>
			<Column field="city" header="City" :sortable="true" :showFilterMenu="false" class="w-2">
				<template #filter="{ filterModel, filterCallback }">
					<MultiSelect
						@change="filterCallback()"
						v-model="filterModel.value"
						:showClear="true"
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
				class="w-2 max-w-20rem"
				:showFilterMenu="false"
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
				:showFilterMenu="false"
				style="width: 13%"
			>
				<template #filter="{ filterModel, filterCallback }">
					<Dropdown
						@change="filterCallback()"
						v-model="filterModel.value"
						:showClear="true"
						:options="statuses"
						placeholder="Any"
						:maxSelectedLabels="1"
					/>
				</template>
			</Column>
			<Column field="applicationDate" header="Application Date" :sortable="true" class="w-auto">
				<template #body="{ data }: { data: PermitsEntity }">
					{{ formatDate(data.applicationDate) }}
				</template>
			</Column>
			<Column field="lastUpdated" header="Last Updated" :sortable="true" class="w-1">
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
			header="Permit Details"
			:modal="true"
			class="p-fluid"
		>
			<div class="grid">
				<div class="col-2 field">
					<label>Primary Address</label>
					<div>
						<AppGoogleLink
							:address="permit.primaryStreetName"
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
				<div class="col-6 field">
					<label>Purpose</label>
					<div
						class="font-bold"
						:class="versionDiffClass('purpose', permit, previousPermit)"
						:title="versionDiffTitle('purpose', permit, previousPermit)"
					>
						{{ permit.purpose }}
					</div>
				</div>
				<div class="col-4 field">
					<label>Documents</label>
					<div class="font-bold">
						<div v-for="(document, index) in permit.documents" :key="document.docName">
							<a
								:href="document.docURL"
								target="_blank"
								class="documentLink"
								:class="versionDiffDocumentClass(index, permit, previousPermit)"
								>{{ document.docName }}</a
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
							<Column field="relatedPermitID" header="ID">
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
							<Column field="relatedPermitType" header="Type"></Column>
						</DataTable>
					</div>
				</div>
			</div>
		</Dialog>
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
