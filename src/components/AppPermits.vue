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

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    primaryStreetName: { value: null, matchMode: FilterMatchMode.STARTS_WITH }
});

const formatDate = (unixDate?: number):string => {
    if(!unixDate) {
        return '';
    }
    return new Date(unixDate * 1000).toString().split(" ").slice(0, 4).slice(1).join(" ");
}

const filteredData = ref(permitInfo.permits);

const globalFilter = ref();


// Permit Dialog
const permit = ref<PermitsEntity | null>(null);
const permitDialogVisible = ref(false);
const viewPermit = (permitData: any) => {
    permit.value = { ...permitData };
    permitDialogVisible.value = true;
};
</script>

<template>
    <main>
        <DataTable :value="filteredData" width="100%" v-model:filters="filters" :globalFilter="globalFilter"
            filterDisplay="menu" stripedRows 
            :globalFilterFields="['primaryStreetName', 'applicant', 'applicationType', 'status', 'applicationType', 'folderNumber', 'status', 'addresses', 'purpose',]"
            :rowsPerPageOptions="[5, 10, 20, 50]" :rows="5" paginator
            paginatorTemplate="RowsPerPageDropdown FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink"
            sortField="lastUpdated" :sortOrder="-1">
            <template #header>
                <div class="flex justify-content-end">
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="filters['global'].value" placeholder="Keyword Search" />
                    </span>
                </div>
            </template>
            <Column :exportable="false" class="w-min">
                <template #body="{ data }">
                    <Button icon="pi pi-search" outlined rounded title="View Permit" @click="viewPermit(data)" />
                </template>
            </Column>
            <Column field="primaryStreetName" filterField="primaryStreetName" header="Primary Address" :sortable="true" class="w-2" >
            </Column>
            <Column field="applicant" header="Applicant" :sortable="true" class="w-2"></Column>
            <Column field="applicationType" header="Application Type" :sortable="true" class="w-2"></Column>
            <Column field="status" header="Status" :sortable="true" class="w-1"></Column>
            <Column field="withDistrictDays" header="With District Days" :sortable="true" class="w-1"></Column>
            <Column field="withApplicantDays" header="With Applicant Days" :sortable="true" class="w-1"></Column>
            <Column field="lastUpdated" header="Last Updated" :sortable="true" class="w-auto">
                <template #body="{ data }">
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
                    <label>Status</label>
                    <div class="font-bold">{{ permit.status }}</div>
                </div>
                <div class="col-2 field">
                    <label>Applicant</label>
                    <div class="font-bold">{{ permit.applicant }}</div>
                </div>
                <div class="col-2 field">
                    <label>Application Type</label>
                    <div class="font-bold">{{ permit.applicationType }}</div>
                </div>
                <div class="col-2 field">
                    <label>Folder Number</label>
                    <div class="font-bold">
                        <a :href="`https://online.saanich.ca/Tempest/OurCity/Prospero/Details.aspx?folderNumber=${permit.folderNumber}`"
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
                <div class="col-4 field">
                    <label>Purpose</label>
                    <div class="font-bold">{{ permit.purpose }}</div>
                </div>
                <div class="col-2 field">
                    <label>With District Days</label>
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
                <div class="col-2 field">
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
                        <DataTable stripedRows  :value="permit.progressSections">
                            <Column field="taskType" header="Type"></Column>
                            <Column field="taskDescription" header="Description"></Column>
                            <Column field="startDate" header="Start Date"><template #body="{ data }">
                                    {{ formatDate(data.startDate) }}
                                </template></Column>
                            <Column field="endDate" header="End Date"><template #body="{ data }">
                                    {{ formatDate(data.endDate) }}
                                </template></Column>
                        </DataTable>
                    </div>
                </div>
            </div>
        </Dialog>
    </main>
</template>
