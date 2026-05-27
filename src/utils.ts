const APP_TITLE: string = import.meta.env.VITE_APP_TITLE;

function getFormattedDate(date: Date | number): string {
	if (typeof date === "number") {
		date = date * 1000;
	}
	return new Date(date).toLocaleDateString("en-ca");
}

/**
 * For Richmond permits, returns the folder number with dashes replaced by spaces.
 * For all other cities, returns the folder number unchanged.
 */
function displayFolderNumber(city: string, folderNumber: string): string {
	if (city === "Richmond") {
		return folderNumber.replace(/-/g, " ");
	}
	return folderNumber;
}

export { APP_TITLE, getFormattedDate, displayFolderNumber };
