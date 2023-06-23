<script setup lang="ts">
import { ref } from 'vue';

import { FilterMatchMode } from 'primevue/api';
import Button from 'primevue/button';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';

import type { PermitsEntity } from '@/types/Permits';

// @ts-ignore: seems like a TS bug?? https://github.com/microsoft/TypeScript/issues/43784
import permitInfo from "@/permitInfo.json";
import MultiSelect from 'primevue/multiselect';
import Dropdown from 'primevue/dropdown';

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    primaryStreetName: { value: null, matchMode: FilterMatchMode.STARTS_WITH },
    applicationType: { value: null, matchMode: FilterMatchMode.IN },
    status: { value: null, matchMode: FilterMatchMode.EQUALS },
    city: { value: null, matchMode: FilterMatchMode.EQUALS }
});

const applicationTypes = ref(getApplicationTypes(permitInfo.permits));

function getApplicationTypes( permitApplications: PermitsEntity[]): string[] {
    const set = new Set<string>();
    for(const application of permitApplications) {
        set.add(application.applicationType);
    }
    const applicationTypes = [ ...set.values() ];
    return applicationTypes;
}

const statuses = ref(getStatuses(permitInfo.permits));

function getStatuses( permitApplications: PermitsEntity[]): string[] {
    const set = new Set<string>();
    for(const application of permitApplications) {
        set.add(application.status);
    }
    const statuses = [ ...set.values() ];
    return statuses;
}

const cities = ref(getCities(permitInfo.permits));

function getCities( permitApplications: PermitsEntity[]): string[]  {
    const set = new Set<string>();
    for(const application of permitApplications) {
        set.add(application.city);
    }
    const cities = [ ...set.values() ];
    return cities;
}

const formatDate = (unixDate?: number): string => {
    if (!unixDate) {
        return '';
    }
    return new Date(unixDate * 1000).toString().split(" ").slice(0, 4).slice(1).join(" ");
}

const dateRetrieved = ref(permitInfo.dateRetrieved);
const permitApplications = ref(permitInfo.permits);

const globalFilter = ref();


// Permit Dialog
const permit = ref<PermitsEntity | null>(null);
const permitDialogVisible = ref(false);
const viewPermit = (permitData: PermitsEntity) => {
    permit.value = { ...permitData };
    permitDialogVisible.value = true;
};

const getPermitApplicationLink = (permitApplication: PermitsEntity): string => {
    if(permitApplication.city === 'Saanich') {
        return 'https://online.saanich.ca/Tempest/OurCity/Prospero/Details.aspx?folderNumber=' + permitApplication.folderNumber;
    } else if(permitApplication.city === 'Victoria') {
        return 'https://tender.victoria.ca/webapps/ourcity/Prospero/Details.aspx?folderNumber=' + permitApplication.folderNumber;
    } else if(permitApplication.city === 'Oak Bay') {
        return 'https://onlineservice.oakbay.ca/WebApps/OurCity/Prospero/Details.aspx?folderNumber=' + permitApplication.folderNumber;
    }
    return '';
};

</script>

<template>
    <main>
        <DataTable :value="permitApplications" width="100%" v-model:filters="filters" :globalFilter="globalFilter"
            filterDisplay="row" stripedRows
            :globalFilterFields="['primaryStreetName', 'applicant', 'city', 'applicationType', 'status', 'folderNumber', 'status', 'addresses', 'purpose',]"
            :rowsPerPageOptions="[5, 10, 20, 50]" :rows="5" paginator
            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            sortField="lastUpdated" :sortOrder="-1" currentPageReportTemplate="{first} to {last} of {totalRecords}">
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
            <Column :exportable="false" class="w-min">
                <template #body="{ data }: { data: PermitsEntity }">
                    <Button icon="pi pi-search" outlined rounded title="View Permit" @click="viewPermit(data)" />
                </template>
            </Column>
            <Column field="primaryStreetName" filterField="primaryStreetName" header="Primary Address" :sortable="true"
                class="w-2">
                <template #filter="{ filterModel, filterCallback }">
                    <InputText v-model="filterModel.value" type="text" @input="filterCallback()" class="p-column-filter"
                        placeholder="Search by address" />
                </template>
            </Column>
            <Column field="city" header="City" :sortable="true" :showFilterMenu="false" class="w-2" >
                <template #filter="{ filterModel, filterCallback }">
                    <Dropdown @change=filterCallback() v-model="filterModel.value" :showClear="true"
                        :options="cities" placeholder="Any" :maxSelectedLabels="1"  />
                </template>
            </Column>
            <Column field="applicationType" header="Application Type" :sortable="true" class="w-2 max-w-20rem"
            :showFilterMenu="false" >
                <template #filter="{ filterModel, filterCallback }">
                    <MultiSelect @change=filterCallback() v-model="filterModel.value" display="comma" 
                        :options="applicationTypes" placeholder="Any" :maxSelectedLabels="1"  />
                </template>
                <template #body="{ data }: { data: PermitsEntity }">
                    <span :title="data.cityApplicationType">{{ data.applicationType }}</span>
                </template>
            </Column>
            <Column field="status" header="Status" :sortable="true" :showFilterMenu="false" style="width: 13%" >
                <template #filter="{ filterModel, filterCallback }">
                    <Dropdown @change=filterCallback() v-model="filterModel.value" :showClear="true"
                        :options="statuses" placeholder="Any" :maxSelectedLabels="1"  />
                </template>
            </Column>
            <Column field="withDistrictDays" header="With Municipality Days" :sortable="true" class="w-1"></Column>
            <Column field="withApplicantDays" header="With Applicant Days" :sortable="true" class="w-1"></Column>
            <Column field="lastUpdated" header="Last Updated" :sortable="true" class="w-auto">
                <template #body="{ data }: { data: PermitsEntity }">
                    {{ formatDate(data.lastUpdated) }}
                </template>
            </Column>
        </DataTable>

        <Dialog v-if=permit v-model:visible="permitDialogVisible" :style="{ 'width': '90vw' }" header="Permit Details"
            :modal="true" class="p-fluid">
            <div class="grid">
                <div class="col-2 field">
                    <label>Primary Address</label>
                    <div class="font-bold">{{ permit.primaryStreetName }}</div>
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
                    <div class="font-bold" :title="permit.cityApplicationType" >{{ permit.applicationType }}</div>
                </div>
                <div class="col-2 field">
                    <label>Folder Number</label>
                    <div class="font-bold">
                        <a :href="getPermitApplicationLink(permit)"
                            target="_blank">{{ permit.folderNumber }}</a>
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
                        <div v-for="address in permit.addresses" :key="address">
                            {{ address }}
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
                        <div v-for="document in permit.documents" :key="document.docName">
                            <a :href="document.docURL" target="_blank">{{ document.docName }}</a>
                        </div>
                        <div v-if="permit.documents.length === 0">
                            No Documents Submitted
                        </div>
                    </div>
                </div>
                <div class="col-12 field">
                    <label>Task Progress</label>
                    <div>
                        <DataTable stripedRows :value="permit.progressSections">
                            <Column field="taskType" header="Type"></Column>
                            <Column field="taskDescription" header="Description"></Column>
                            <Column field="startDate" header="Start Date">
                                <template #body="{ data }">
                                    {{ formatDate(data.startDate) }}
                                </template>
                            </Column>
                            <Column field="endDate" header="End Date">
                                <template #body="{ data }">
                                    {{ formatDate(data.endDate) }}
                                </template>
                            </Column>
                        </DataTable>
                    </div>
                </div>
            </div>
        </Dialog>
    </main>
</template>
