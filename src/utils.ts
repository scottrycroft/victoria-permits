
function getFormattedDate(date: Date | number): string {
	if (typeof date === "number") {
		date = date * 1000;
	}
	return new Date(date).toLocaleDateString("en-ca");
}


export {
	getFormattedDate,
}
