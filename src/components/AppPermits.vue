<script setup lang="ts">
import { ref } from 'vue';

import { FilterMatchMode } from 'primevue/api';
import Column from 'primevue/column';
import DataTable from 'primevue/datatable';
import InputText from 'primevue/inputtext';

// @ts-ignore: seems like a TS bug?? https://github.com/microsoft/TypeScript/issues/43784
import permitInfo from "@/permitInfo.json";

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS },
    primaryStreetName: { value: null, matchMode: FilterMatchMode.STARTS_WITH }
});

const formatDate = (unixDate: number) => {
    return new Date(unixDate * 1000).toString().split(" ").slice(0,4).slice(1).join(" ");
}

const filteredData = ref(permitInfo.permits);

const globalFilter = ref([]);
</script>

<template>
    <main>
        <DataTable :value="filteredData" :rows="10" paginator width="100%" :globalFilter="globalFilter" filterDisplay="menu"
            v-model:filters="filters" :globalFilterFields="['primaryStreetName', 'applicant', 'applicationType', 'status']">
            <template #header>
                <div class="flex justify-content-end">
                    <span class="p-input-icon-left">
                        <i class="pi pi-search" />
                        <InputText v-model="filters['global'].value" placeholder="Keyword Search" />
                    </span>
                </div>
            </template>
            <Column field="primaryStreetName" filterField="primaryStreetName" header="Primary Street Name" :sortable="true">
            </Column>
            <Column field="applicant" header="Applicant" :sortable="true"></Column>
            <Column field="applicationType" header="Application Type" :sortable="true"></Column>
            <Column field="folderNumber" header="Folder Number" :sortable="true"></Column>
            <Column field="applicationDate" header="Application Date" :sortable="true">
                <template #body="{ data }">
                    {{ formatDate(data.applicationDate) }}
                </template>
            </Column>
            <Column field="addresses" header="Addresses" :sortable="true">
                <template #body="{ data }">
                    <div v-for="address in data.addresses" :key="address">
                        {{ address }}
                    </div>
                </template>
            </Column>
            <Column field="status" header="Status" :sortable="true"></Column>
            <Column field="purpose" header="Purpose" :sortable="true"></Column>
            <Column field="withDistrictDays" header="With District Days" :sortable="true"></Column>
            <Column field="withApplicantDays" header="With Applicant Days" :sortable="true"></Column>
            <Column field="lastUpdated" header="Last Updated" :sortable="true">
                <template #body="{ data }">
                    {{ formatDate(data.lastUpdated) }}
                </template>
            </Column>
        </DataTable>
    </main>
</template>
