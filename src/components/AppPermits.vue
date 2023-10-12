<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router'

import { FilterMatchMode } from 'primevue/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { useToast } from "primevue/usetoast";

import AppGoogleLink from './AppGoogleLink.vue';

import type { PermitsEntity, RelatedPermit } from '@/types/Permits';

// @ts-ignore: seems like a TS bug?? https://github.com/microsoft/TypeScript/issues/43784
import permitInfo from "@/permitInfo.json";
// @ts-ignore:
import daysWithInfo from "@/daysContentPermitInfo.json";

import MultiSelect from 'primevue/multiselect';
import Dropdown from 'primevue/dropdown';
import Toast from 'primevue/toast';


const route = useRoute();
const router = useRouter();
const toast = useToast();

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    primaryStreetName: { value: null, matchMode: FilterMatchMode.CONTAINS },
    applicationType: { value: null, matchMode: FilterMatchMode.IN },
    status: { value: null, matchMode: FilterMatchMode.EQUALS },
    city: { value: null, matchMode: FilterMatchMode.IN }
});

const applicationTypes = ref(getApplicationTypes(permitInfo.permits));

function getApplicationTypes(permitApplications: PermitsEntity[]): string[] {
    const set = new Set<string>();
    for (const application of permitApplications) {
        set.add(application.applicationType);
    }
    const applicationTypes = [...set.values()];
    return applicationTypes;
}

const permitMap = ref(createPermitMap(permitInfo.permits));

const relatedPermits = ref(createRelatedPermits(permitInfo.permits));

const statuses = ref(getStatuses(permitInfo.permits));

function getStatuses(permitApplications: PermitsEntity[]): string[] {
    const set = new Set<string>();
    for (const application of permitApplications) {
        set.add(application.status);
    }
    const statuses = [...set.values()];
    return statuses;
}

const cities = ref(getCities(permitInfo.permits));

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
        return '';
    }
    return new Date(unixDate * 1000).toString().split(" ").slice(0, 4).slice(1).join(" ");
}

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

const dateRetrieved = ref(permitInfo.dateRetrieved);
const permitApplications = ref(createPermitApplications(permitInfo.permits, daysWithInfo));

const globalFilter = ref();


// Permit Dialog
const permit = ref<PermitsEntity | null>(null);
const permitDialogVisible = ref(false);
const viewPermit = (permitData: PermitsEntity) => {
    permit.value = { ...permitData };
    permitDialogVisible.value = true;
};
function onDialogHide() {
    router.push({ name: 'home' });
}

// fetch the user information when params change
watch(
    () => route.params.city,
    async city => {
        if (!city) {
            return;
        }
        setViewedPA(city as string, route.params.permitID as string);
    },
    {
        immediate: true
    }
);
watch(
    () => route.params.permitID,
    async permitID => {
        if (!permitID) {
            return;
        }
        setViewedPA(route.params.city as string, permitID as string);
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

function getDaysWith(pa: PermitsEntity, daysWithInfo: any): { withDistrictDays: number | null, withApplicantDays: number | null } {
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
    return getPermitApplicationLinkByID(pa.city, pa.folderNumber);
};

const getPermitApplicationLinkByID = (city: string, permitID: string): string => {
    if (city === 'Saanich') {
        return 'https://online.saanich.ca/Tempest/OurCity/Prospero/Details.aspx?folderNumber=' + permitID;
    } else if (city === 'Victoria') {
        return 'https://tender.victoria.ca/webapps/ourcity/Prospero/Details.aspx?folderNumber=' + permitID;
    } else if (city === 'Oak Bay') {
        return 'https://onlineservice.oakbay.ca/WebApps/OurCity/Prospero/Details.aspx?folderNumber=' + permitID;
    } else if (city === 'Central Saanich') {
        return 'https://www.mycentralsaanich.ca/TempestLive/OURCITY/Prospero/Details.aspx?folderNumber=' + permitID;
    } else if (city === 'Colwood') {
        return getColwoodLinkByID(permitID)
    } else if (city === 'Esquimalt') {
        return getEsquimaltLinkByID(permitID);
    } else if (city === 'View Royal') {
        return getViewRoyalLinkByID(permitID);
    }
    return '';
};

function getEsquimaltLinkByID(permitID: string) {
    const match = permitID.match(/^[A-Z]+/);
    if(!match) {
        toast.add({ severity: "error", summary: "Cannot get link for Esquimalt permit " + permitID });
        return "";
    }
    const prefix = match[0];
    let baseUrl = "";
    switch(prefix) {
        case "DVP":
            baseUrl = "https://www.esquimalt.ca/business-development/development-tracker/development-variance-permit-applications"
            break;
        case "RZ":
            baseUrl = "https://www.esquimalt.ca/business-development/development-tracker/rezoning-applications"
            break;
        case "DP":
            baseUrl = "https://www.esquimalt.ca/business-development/development-tracker/development-permit-applications"
            break;
    }
    if(!baseUrl) {
        console.error(prefix, permitID);
        toast.add({ severity: "error", summary: "Cannot get link for Esquimalt permit " + permitID });
        return "";
    }
    const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D")
    return fullUrl;
}

function getViewRoyalLinkByID(permitID: string) {
    const match = permitID.match(/^[A-Z]+/);
    if(!match) {
        toast.add({ severity: "error", summary: "Cannot get link for View Royal permit " + permitID });
        return "";
    }
    const prefix = match[0];
    let baseUrl = "";
    switch(prefix) {
        case "DVP":
            baseUrl = "https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/development-variance-permit-applications.html"
            break;
        case "REZ":
            baseUrl = "https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/rezoning-applications.html"
            break;
        case "DP":
            baseUrl = "https://www.viewroyal.ca/EN/main/business/Land_Development/active-development-applications/development-permit-applications.html"
            break;
    }
    if(!baseUrl) {
        console.error(prefix, permitID);
        toast.add({ severity: "error", summary: "Cannot get link for View Royal permit " + permitID });
        return "";
    }
    
    const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D")
    return fullUrl;
}

function getColwoodLinkByID(permitID: string) {
    const match = permitID.match(/^[A-Z]+/);
    if(!match) {
        toast.add({ severity: "error", summary: "Cannot get link for Colwood permit " + permitID });
        return "";
    }
    let baseUrl = "https://www.colwood.ca/city-services/development-services/development-activity";
    
    const fullUrl = baseUrl + "#:~:text=" + encodeURIComponent(permitID).replace(/-/g, "%2D")
    return fullUrl;
}

function showNoPAToast() {
    toast.add({ severity: "error", summary: "No such permit application" });
}
</script>

<template>
    <main>
        <DataTable :value="permitApplications" width="100%" v-model:filters="filters" :globalFilter="globalFilter"
            filterDisplay="row" stripedRows
            :globalFilterFields="['primaryStreetName', 'applicant', 'city', 'applicationType', 'status', 'folderNumber', 'status', 'addresses', 'purpose','lastUpdated']"
            :rowsPerPageOptions="[5, 10, 20, 50]" :rows="5" paginator
            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            sortField="applicationDate" :sortOrder="-1" currentPageReportTemplate="{first} to {last} of {totalRecords}">
            <template #header>
                <div class="flex justify-content-between">
                    <h2 class="mt-0">Permit Applications</h2>
                    <div>
                        Data retrieved on {{ formatDate(dateRetrieved) }}
                    </div>
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="filters['global'].value" placeholder="Keyword Search"
                            style="width: 50vw; min-width: 250px;" />
                    </span>
                </div>
            </template>
            <Column :exportable="false" class="w-1">
                <template #body="{ data }: { data: PermitsEntity }">
                    <router-link
                        :to=" { name: 'view_permit', params: { city: data.city, permitID: data.folderNumber } } "><Button
                            icon="pi pi-search" outlined rounded title="View Permit" /></router-link>
                </template>
            </Column>
            <Column field="primaryStreetName" filterField="primaryStreetName" header="Primary Address" :sortable=" true "
                class="w-2">
                <template #filter=" { filterModel, filterCallback } ">
                    <InputText v-model=" filterModel.value " type="text" @input="filterCallback()" class="p-column-filter"
                        placeholder="Search by address" />
                </template>
                <template #body=" { data }: { data: PermitsEntity } ">
                    <AppGoogleLink :address=" data.primaryStreetName " />
                </template>
            </Column>
            <Column field="city" header="City" :sortable=" true " :showFilterMenu=" false " class="w-2">
                <template #filter=" { filterModel, filterCallback } ">
                    <MultiSelect @change=filterCallback() v-model=" filterModel.value " :showClear=" true "
                        :options=" cities " placeholder="Any" :maxSelectedLabels=" 1 " />
                </template>
            </Column>
            <Column field="applicationType" header="Application Type" :sortable=" true " class="w-2 max-w-20rem"
                :showFilterMenu=" false ">
                <template #filter=" { filterModel, filterCallback } ">
                    <MultiSelect @change=filterCallback() v-model=" filterModel.value " display="comma"
                        :options=" applicationTypes " placeholder="Any" :maxSelectedLabels=" 1 " />
                </template>
                <template #body=" { data }: { data: PermitsEntity } ">
                    <span :title=" data.cityApplicationType ">{{ data.applicationType }}</span>
                </template>
            </Column>
            <Column field="status" header="Status" :sortable=" true " :showFilterMenu=" false " style="width: 13%">
                <template #filter=" { filterModel, filterCallback } ">
                    <Dropdown @change=filterCallback() v-model=" filterModel.value " :showClear=" true "
                        :options=" statuses " placeholder="Any" :maxSelectedLabels=" 1 " />
                </template>
            </Column>
            <Column field="applicationDate" header="Application Date" :sortable=" true " class="w-auto">
                <template #body=" { data }: { data: PermitsEntity } ">
                    {{ formatDate(data.applicationDate) }}
                </template>
            </Column>
            <Column field="lastUpdated" header="Last Updated" :sortable=" true " class="w-1">
                <template #body=" { data }: { data: PermitsEntity } ">
                    {{ formatDate(data.lastUpdated) }}
                </template>
            </Column>

        </DataTable>

        <Dialog v-if= permit  @after-hide=" onDialogHide " v-model:visible=" permitDialogVisible " :dismissableMask=" true "
            :style=" { 'width': '90vw' } " header="Permit Details" :modal=" true " class="p-fluid">
            <div class="grid">
                <div class="col-2 field">
                    <label>Primary Address</label>
                    <div>
                        <AppGoogleLink :address=" permit.primaryStreetName " />
                    </div>
                </div>
                <div class="col-2 field">
                    <label>City</label>
                    <div class="font-bold">{{ permit.city }}</div>
                </div>
                <div class="col-2 field">
                    <label>Status</label>
                    <div class="font-bold">{{ permit.status }}</div>
                </div>
                <div class="col-2 field">
                    <label>Application Type</label>
                    <div class="font-bold" :title=" permit.cityApplicationType ">{{ permit.applicationType }}</div>
                </div>
                <div class="col-2 field">
                    <label>Permit Identifier</label>
                    <div class="font-bold">
                        <a :href=" getPermitApplicationLink(permit) " target="_blank">{{ permit.folderNumber }}</a>
                    </div>
                </div>
                <div class="col-2 field">
                    <label>Application Date</label>
                    <div class="font-bold">{{ formatDate(permit.applicationDate) }}</div>
                </div>
            </div>
            <div class="grid mt-3">
                <div class="col-2 field">
                    <label>Addresses</label>
                    <div class="font-bold">
                        <div v-for="    address     in     permit.addresses    " :key=" address ">
                            <AppGoogleLink :address=" address " />
                        </div>
                    </div>
                </div>
                <div class="col-2 field">
                    <label>Applicant</label>
                    <div class="font-bold">{{ permit.applicant }}</div>
                </div>
                <div class="col-2 field">
                    <label>With Municipality Days</label>
                    <div class="font-bold">{{ permit.withDistrictDays }}</div>
                </div>
                <div class="col-2 field">
                    <label>With Applicant Days</label>
                    <div class="font-bold">{{ permit.withApplicantDays }}</div>
                </div>
                <div class="col-2 field">
                    <label>Last Updated</label>
                    <div class="font-bold">{{ formatDate(permit.lastUpdated) }}</div>
                </div>
            </div>
            <div class="grid mt-3">
                <div class="col-6 field">
                    <label>Purpose</label>
                    <div class="font-bold">{{ permit.purpose }}</div>
                </div>
                <div class="col-4 field">
                    <label>Documents</label>
                    <div class="font-bold">
                        <div v-for=" document  in  permit.documents " :key=" document.docName ">
                            <a :href=" document.docURL " target="_blank">{{ document.docName }}</a>
                        </div>
                        <div v-if=" permit.documents.length === 0 ">
                            No Documents Submitted
                        </div>
                    </div>
                </div>
                <div class="col-12 field">
                    <label>Task Progress</label>
                    <div>
                        <DataTable stripedRows :value=" permit.progressSections ">
                            <Column field="taskType" header="Type"></Column>
                            <Column field="taskDescription" header="Description"></Column>
                            <Column field="startDate" header="Start Date">
                                <template #body=" { data } ">
                                    {{ formatDate(data.startDate) }}
                                </template>
                            </Column>
                            <Column field="endDate" header="End Date">
                                <template #body=" { data } ">
                                    {{ formatDate(data.endDate) }}
                                </template>
                            </Column>
                        </DataTable>
                    </div>
                </div>
                <div v-if="permit.relatedPermits?.length" class="col-12 field">
                    <label>Related Permits</label>
                    <div>
                        <DataTable stripedRows :value=" permit.relatedPermits || [] ">
                            <Column field="relatedPermitID" header="ID">
                                <template #body=" { data: { relatedPermitID } }: { data: RelatedPermit } ">
                                    <router-link v-if=" permitExistByID(permit.city, relatedPermitID) === 'exists' "
                                        :to=" { name: 'view_permit', params: { city: permit.city, permitID: relatedPermitID } } ">
                                        {{ relatedPermitID }}
                                    </router-link>
                                    <a v-else-if=" permitExistByID(permit.city, relatedPermitID) === 'related' "
                                        target="_blank"
                                        :href=" getPermitApplicationLinkByID(permit.city, relatedPermitID) ">
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
        <Toast class="w-9" position="bottom-center" :pt="
            {
                summary: { class: 'text-xl' },
                text: { class: 'text-center text-red-500' }
            }
        " />
    </main>
</template>
