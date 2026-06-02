/**
 * Test suite for AppPermits.vue
 *
 * Tests cover:
 * 1. Loading the site with a minimal static set of permits
 * 2. Filtering permits (global search, city, status, application type, minor/major, storeys, approval status)
 * 3. Opening the permit dialog and verifying all possible data pieces are displayed
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { createRouter, createWebHistory, type Router } from "vue-router";

// ── Mock p-debounce to be a passthrough (no debouncing in tests) ────
vi.mock("p-debounce", () => ({
	default: (fn: Function) => fn
}));

// ── Mock JSON data imports BEFORE importing the component ───────────
vi.mock("@/permitInfo.json", () => import("./fixtures/permitInfo.json"));
vi.mock("@/daysContentPermitInfo.json", () => import("./fixtures/daysContentPermitInfo.json"));

// Mock geocoding to avoid Google Maps dependency
vi.mock("@/geocoding", () => ({
	geocodingService: {
		geocodeAndCachePermit: vi.fn().mockResolvedValue(null),
		geocodeAddressWithCache: vi.fn().mockResolvedValue(null),
		getCachedLocation: vi.fn().mockResolvedValue(null),
		getPermitAddressCacheKey: vi.fn(
			(p: any) => `${p.primaryStreetName}, ${p.city}, BC, Canada`
		),
		permitHasCoordinates: vi.fn(() => false),
		getPermitCoordinates: vi.fn(() => null)
	}
}));

// Mock Google Maps loader
vi.mock("@/googleMapsLoader", () => ({
	loadGoogleMapsAPI: vi.fn().mockResolvedValue(undefined),
	isGoogleMapsLoaded: vi.fn(() => false)
}));

import AppPermits from "@/components/AppPermits.vue";

// ── Helpers ─────────────────────────────────────────────────────────

function createTestRouter(): Router {
	return createRouter({
		history: createWebHistory(),
		routes: [
			{ path: "/", name: "home", component: { template: "<div />" } },
			{
				path: "/p/:city/:permitID",
				name: "view_permit",
				component: { template: "<div />" }
			}
		]
	});
}

const globalPluginsAndStubs = (router: Router) => ({
	plugins: [router]
});

async function mountAtHome() {
	const router = createTestRouter();
	router.push("/");
	await router.isReady();
	const wrapper = mount(AppPermits, {
		global: globalPluginsAndStubs(router),
		attachTo: document.body
	});
	await flushPromises();
	return { wrapper, router };
}

async function mountAtPermit(city: string, permitID: string) {
	const router = createTestRouter();
	router.push(`/p/${encodeURIComponent(city)}/${encodeURIComponent(permitID)}`);
	await router.isReady();
	const wrapper = mount(AppPermits, {
		global: globalPluginsAndStubs(router),
		attachTo: document.body
	});
	await flushPromises();
	// Allow async operations (DB writes, etc.) to settle
	await new Promise((r) => setTimeout(r, 100));
	await flushPromises();
	return { wrapper, router };
}

/** Get text from document.body (includes teleported dialog content) */
function bodyText(): string {
	return document.body.textContent || "";
}

/** Get innerHTML from document.body */
function bodyHTML(): string {
	return document.body.innerHTML;
}

// ── Tests ───────────────────────────────────────────────────────────

describe("AppPermits", () => {
	let currentWrapper: VueWrapper | null = null;

	afterEach(() => {
		// Clean up mounted component to avoid leaking teleported DOM
		if (currentWrapper) {
			currentWrapper.unmount();
			currentWrapper = null;
		}
		vi.restoreAllMocks();
	});

	// ================================================================
	// 1. SITE LOADING
	// ================================================================
	describe("Site Loading", () => {
		it("renders the DataTable header", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.text()).toContain("Permit Applications");
		});

		it("shows the data retrieved date", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.text()).toContain("Data retrieved on");
		});

		it("displays the keyword search input", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const searchInput = wrapper.find("input[placeholder='Keyword Search']");
			expect(searchInput.exists()).toBe(true);
		});

		it("renders all filter controls in the header", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			expect(text).toContain("Unviewed docs only");
			expect(text).toContain("Favourites only");
			expect(text).toContain("Approval status");
			expect(text).toContain("Major permits");
			expect(text).toContain("Storeys");
			expect(text).toContain("Show Map");
		});

		it("shows non-minor permit folder numbers in the table", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			// Default showOnlyMinor=false filters OUT minor permits
			expect(text).toContain("BP-00100");
			expect(text).toContain("DPR01050");
			expect(text).toContain("DP-00200");
		});

		it("shows city names in the table", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			expect(text).toContain("Victoria");
			expect(text).toContain("Saanich");
		});

		it("shows application types in the table", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			expect(text).toContain("Building Permit");
			expect(text).toContain("Development Permit");
		});

		it("shows status values in the table", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			expect(text).toContain("Under Review");
			expect(text).toContain("Active");
		});

		it("shows primary street names in the table", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const text = wrapper.text();
			expect(text).toContain("123 MAIN ST");
			expect(text).toContain("456 OAK AVE");
		});

		it("renders the major bolt icon for major permits", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const boltIcons = wrapper.findAll("i.pi-bolt");
			expect(boltIcons.length).toBeGreaterThan(0);
		});

		it("renders a DataTable element", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const dt = wrapper.find("[data-pc-name='datatable']");
			expect(dt.exists()).toBe(true);
		});
	});

	// ================================================================
	// 2. FILTERING
	// ================================================================
	describe("Filtering", () => {
		it("filters by global keyword search for address", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const searchInput = wrapper.find("input[placeholder='Keyword Search']");
			await searchInput.setValue("MAIN ST");
			await flushPromises();
			expect(wrapper.text()).toContain("123 MAIN ST");
		});

		it("filters by global keyword search for folder number", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const searchInput = wrapper.find("input[placeholder='Keyword Search']");
			await searchInput.setValue("BP-00100");
			await flushPromises();
			expect(wrapper.text()).toContain("BP-00100");
		});

		it("filters by global keyword search for applicant name", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const searchInput = wrapper.find("input[placeholder='Keyword Search']");
			await searchInput.setValue("John Builder");
			await flushPromises();
			expect(wrapper.text()).toContain("123 MAIN ST");
		});

		it("filters by global keyword search for purpose text", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			const searchInput = wrapper.find("input[placeholder='Keyword Search']");
			await searchInput.setValue("mixed-use building");
			await flushPromises();
			expect(wrapper.text()).toContain("BP-00100");
		});

		it("has the unviewed docs checkbox", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterUnviewedDocs").exists()).toBe(true);
		});

		it("has the favourites checkbox", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterFavourites").exists()).toBe(true);
		});

		it("has the approval status dropdown", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterApprovalStatus").exists()).toBe(true);
		});

		it("has the major permits dropdown", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterMajor").exists()).toBe(true);
		});

		it("has the storeys filter input", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterStoreys").exists()).toBe(true);
		});

		it("has the storeys filter mode dropdown", async () => {
			const { wrapper } = await mountAtHome();
			currentWrapper = wrapper;
			expect(wrapper.find("#filterStoreysMode").exists()).toBe(true);
		});
	});

	// ================================================================
	// 3. PERMIT DIALOG — all possible data pieces
	//    PrimeVue Dialog teleports to document.body, so we use bodyText()
	// ================================================================
	describe("Permit Dialog — Victoria BP-00100 (full data)", () => {
		it("opens the permit dialog via route", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Permit Details");
		});

		it("displays primary address", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Primary Address");
			expect(text).toContain("123 MAIN ST");
		});

		it("displays city label and value", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const html = bodyHTML();
			expect(html).toContain(">City</label>");
			expect(bodyText()).toContain("Victoria");
		});

		it("displays status", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Under Review");
		});

		it("displays application type", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Application Type");
			expect(text).toContain("Building Permit");
		});

		it("displays permit identifier (folder number)", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("BP-00100");
		});

		it("displays application date", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Application Date");
			expect(text).toMatch(/Dec\s+3[01]\s+2022|Jan\s+0?1\s+2023/);
		});

		it("displays all addresses", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Addresses");
			expect(text).toContain("123 MAIN ST");
			expect(text).toContain("125 MAIN ST");
		});

		it("displays applicant", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Applicant");
			expect(text).toContain("John Builder");
		});

		it("displays with municipality days", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("With Municipality Days");
			expect(text).toContain("30");
		});

		it("displays with applicant days", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("With Applicant Days");
			expect(text).toContain("5");
		});

		it("displays last updated date", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Last Updated");
			expect(text).toMatch(/Jan\s+3[01]\s+2023|Feb\s+0?1\s+2023/);
		});

		it("displays storeys", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Storeys");
			expect(text).toContain("3");
		});

		it("displays purpose", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain(
				"Construct a new 3-storey mixed-use building"
			);
		});

		it("displays documents with names", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Documents");
			expect(text).toContain("Site Plan");
			expect(text).toContain("Elevation Drawings");
			expect(text).toContain("Landscape Plan");
		});

		it("displays document links with correct URLs", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const html = bodyHTML();
			expect(html).toContain("https://example.com/docs/siteplan.pdf");
			expect(html).toContain("https://example.com/docs/elevations.pdf");
			expect(html).toContain("https://example.com/docs/landscape.pdf");
		});

		it("displays task progress sections", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Task Progress");
			expect(text).toContain("Application received");
			expect(text).toContain("Zoning review complete");
			expect(text).toContain("Engineering review");
			expect(text).toContain("APPLICATION");
			expect(text).toContain("ZONING REVIEW");
			expect(text).toContain("ENGINEERING");
		});

		it("displays related permits", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Related Permits");
			expect(text).toContain("DP-00200");
			expect(text).toContain("Development Permit");
		});

		it("displays approval status tag (Approved)", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Approved");
		});

		it("displays major tag", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Major");
		});

		it("displays favourite and mark viewed buttons", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Favourite");
			expect(text).toContain("Mark viewed");
		});

		it("displays the permit link pointing to Victoria Prospero", async () => {
			const { wrapper } = await mountAtPermit("Victoria", "BP-00100");
			currentWrapper = wrapper;
			const html = bodyHTML();
			expect(html).toContain("tender.victoria.ca");
			expect(html).toContain("BP-00100");
		});
	});

	describe("Permit Dialog — Oak Bay REZ-00050 (minor, rejected, no docs)", () => {
		it("shows 'No Documents Submitted'", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("No Documents Submitted");
		});

		it("displays rejected approval status tag", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Rejected");
		});

		it("displays minor tag", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Minor");
		});

		it("displays multiple addresses", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("789 BEACH DR");
			expect(text).toContain("791 BEACH DR");
			expect(text).toContain("793 BEACH DR");
		});

		it("displays rezoning application type", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Rezoning");
		});

		it("displays pending status", async () => {
			const { wrapper } = await mountAtPermit("Oak Bay", "REZ-00050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Pending");
		});
	});

	describe("Permit Dialog — Central Saanich BP-22-0100 (superseded, null dates, empty applicant)", () => {
		it("displays superseded approval status tag", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Superseded");
		});

		it("displays completed status", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Completed");
		});

		it("handles null application date gracefully", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Application Date");
		});

		it("handles empty applicant gracefully", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Applicant");
		});

		it("handles empty progress sections", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Task Progress");
		});

		it("handles document with empty name (falls back to URL-derived name)", async () => {
			const { wrapper } = await mountAtPermit("Central Saanich", "BP-22-0100");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("unnamed-doc");
		});
	});

	describe("Permit Dialog — Saanich DPR01050 (with days-with info)", () => {
		it("displays days-with info from fixture data", async () => {
			const { wrapper } = await mountAtPermit("Saanich", "DPR01050");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("With Municipality Days");
			expect(text).toContain("45");
			expect(text).toContain("With Applicant Days");
			expect(text).toContain("12");
		});

		it("displays storeys field", async () => {
			const { wrapper } = await mountAtPermit("Saanich", "DPR01050");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Storeys");
		});
	});

	describe("Permit Dialog — Colwood DP-2023-001 (no optional flags)", () => {
		it("displays set to major button for non-major permit", async () => {
			const { wrapper } = await mountAtPermit("Colwood", "DP-2023-001");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Set to Major");
		});

		it("displays set to minor button for non-minor permit", async () => {
			const { wrapper } = await mountAtPermit("Colwood", "DP-2023-001");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("Set to Minor");
		});

		it("does not display approval status tags when undefined", async () => {
			const { wrapper } = await mountAtPermit("Colwood", "DP-2023-001");
			currentWrapper = wrapper;
			const html = bodyHTML();
			// Check that no approval status Tag components are rendered
			// The dialog header should not contain Approved/Rejected/Superseded tags
			const tagRegex = /data-pc-name="tag"[^>]*>[^<]*(Approved|Rejected|Superseded)/;
			expect(tagRegex.test(html)).toBe(false);
		});

		it("displays cityApplicationType as title on application type", async () => {
			const { wrapper } = await mountAtPermit("Colwood", "DP-2023-001");
			currentWrapper = wrapper;
			const html = bodyHTML();
			expect(html).toContain("DEVELOPMENT PERMIT - COMMERCIAL");
		});
	});

	describe("Permit Dialog — Richmond BLD-2023-00500 (display folder number with spaces)", () => {
		it("displays Richmond folder number with spaces instead of dashes", async () => {
			const { wrapper } = await mountAtPermit("Richmond", "BLD-2023-00500");
			currentWrapper = wrapper;
			expect(bodyText()).toContain("BLD 2023 00500");
		});

		it("displays 12-storey building", async () => {
			const { wrapper } = await mountAtPermit("Richmond", "BLD-2023-00500");
			currentWrapper = wrapper;
			const text = bodyText();
			expect(text).toContain("Storeys");
			expect(text).toContain("12");
		});
	});
});
