/* Fixed onboard gradient for the Colorful CVN Z590M — TEMPORARY diagnostic.
 * Not the shipped plugin. Writes the 140-LED frame straight to wire slots:
 *   slot 2  (top of the right edge)          RED
 *   slot 15/16 (bottom-right corner)         BLUE
 *   slot 19 (far left of the bottom edge)    GREEN
 * Smooth interpolation along the 18-slot polyline; everything else black.
 */
export function Name() { return "Colorful CVN Z590M GAMING FROZEN V20"; }
export function VendorId() { return 0x2F4C; }
export function ProductId() { return 0x1000; }
export function Publisher() { return "WhirlwindFX"; }
export function Type() { return "HID"; }
export function DeviceType() { return "motherboard"; }
export function Size() { return [1, 1]; }

export function Validate(endpoint) {
	const match = endpoint.usage_page === 0xFF01 && endpoint.usage === 1;
	if (match) { Endpoint = endpoint; }
	return match;
}

let Endpoint = null;
const TOTAL = 140;
const FIRST = 2;
const LAST = 19;
const CORNER = 0.8;   // slot 15 is 13/17 = 0.76, slot 16 is 14/17 = 0.82

export function Initialize() {
	if (Endpoint) {
		device.set_endpoint(Endpoint.interface, Endpoint.usage, Endpoint.usage_page, Endpoint.collection);
	}
	device.setName("Colorful Z590M gradient");
	device.SetLedLimit(TOTAL);
}

const mix = (a, b, f) => a.map((v, i) => Math.round(v + (b[i] - v) * f));

function gradientAt(t) {
	if (t <= CORNER) { return mix([255, 0, 0], [0, 0, 255], t / CORNER); }
	return mix([0, 0, 255], [0, 255, 0], (t - CORNER) / (1 - CORNER));
}

export function Render() {
	const buf = new Array(TOTAL * 3).fill(0);
	for (let slot = FIRST; slot <= LAST; slot++) {
		const rgb = gradientAt((slot - FIRST) / (LAST - FIRST));
		buf[slot * 3] = rgb[0];
		buf[slot * 3 + 1] = rgb[1];
		buf[slot * 3 + 2] = rgb[2];
	}

	for (let packet = 0; packet < TOTAL / 20; packet++) {
		const out = [0x00, 0x01, 0x00, 0x88, packet];
		for (let i = 0; i < 60; i++) { out.push(buf[packet * 60 + i]); }
		device.write(out, 65);
	}
	const commit = [0x00, 0x01, 0x00, 0x88, 0xFF];
	for (let i = 0; i < 60; i++) { commit.push(0x00); }
	device.write(commit, 65);
}

export function Shutdown() {
	const out = [0x00, 0x01, 0x00, 0x88, 0xFF];
	for (let i = 0; i < 60; i++) { out.push(0x00); }
	device.write(out, 65);
}
