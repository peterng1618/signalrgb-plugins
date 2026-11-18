/* Two-point direction probe for the Colorful CVN Z590M onboard shroud.
 * TEMPORARY, not the shipped plugin. Lights exactly the wire slots in LIGHT,
 * everything else black, held indefinitely.
 *   vertical run  slots 2..13   -> probe [2, 13]
 *   bottom run    slots 14..19  -> probe [14, 19]
 * Slots are wire order: the frame buffer index, no permutation applied.
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
const LIGHT = [[15, [255, 255, 255]]];  // slot 15 only, white
const TOTAL = 140;

export function Initialize() {
	if (Endpoint) {
		device.set_endpoint(Endpoint.interface, Endpoint.usage, Endpoint.usage_page, Endpoint.collection);
	}
	device.setName("Colorful Z590M direction probe");
	device.SetLedLimit(TOTAL);
	device.addChannel("Onboard", 18);
	device.addChannel("12V RGB", 1);
	device.addChannel("ARGB 1", 60);
	device.addChannel("ARGB 2", 60);
}

export function Render() {
	const buf = new Array(TOTAL * 3).fill(0);
	for (const [slot, rgb] of LIGHT) {
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
