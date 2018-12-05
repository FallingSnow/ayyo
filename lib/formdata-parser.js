const GROUPS_REGEX = new RegExp("name=\"(?<name>.*?)\"(; filename=\"(?<filename>.*?)\")?");

export function parse(boundary, data) {
    let segments = data.split(boundary);
    // Remove first and last segment
    segments = segments.splice(1, segments.length - 2);

    return segments.reduce((fields, segment) => {
        segment = segment.trim();

        // Split headers from content
        let seperatorIndex = segment.indexOf('\n\n');
        const [headersArray, content] = [segment.substring(0, seperatorIndex).split('\n'), segment.substring(seperatorIndex + 2)];

        // Convert header array to an object
        let headers = {};
        for (const header of headersArray) {
            const seperatorIndex = header.indexOf(': ');
            const [key, value] = [header.substring(0, seperatorIndex), header.substring(seperatorIndex + 2)];
            headers[key] = value;
        }

        // Get regex groups such as name and filename
        const matches = GROUPS_REGEX.exec(headers['Content-Disposition'] || "").groups;

        fields[matches.name || ""] = {headers, content, ...matches};

        return fields;
    }, {});
}
