"use strict";

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const adapterName = require("./package.json").name.split(".").pop();
const { SerialPort } = require("serialport");
const { DelimiterParser } = require("@serialport/parser-delimiter");
// Load your modules here, e.g.:
// const fs = require("fs");
let fs;
class Wallboxamo extends utils.Adapter {
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "wallboxamo",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		//variabels
		this.abl_watchdog_status;

		//array
		this.ACommandSetting = [
			//name, BstatusControll, cleartimout, answer, check current
			["current", false, true, true, true],
			["unlock", true, true, false, false],
			["locked", true, false, true, false],
			["reset", true, false, true, false],
		];

		this.ACurrentAdress = [
			":01100014000102006474\r\n",
			":01100014000102007563\r\n",
			":01100014000102008553\r\n",
			":01100014000102009642\r\n",
			":0110001400010200A731\r\n",
			":0110001400010200B721\r\n",
			":0110001400010200C810\r\n",
			":0110001400010200D9FF\r\n",
			":0110001400010200E9EF\r\n",
			":0110001400010200FADE\r\n",
			":01100014000102010BCC\r\n",
		];

		this.AAnswerSerial = [
			[">011000140001DA", "passed"],
			[">0190046B", "failed"],
		];
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		this.setState("info.connection", true, true);

		this.subscribeStates("send.current");
		this.subscribeStates("send.reset");
		this.subscribeStates("send.locked");
		this.subscribeStates("send.unlock");

		SerialPort.list()
			.then((ports) => {
				const raw_ports = ports;
				const JSON_raw = raw_ports[0];
				const JSON_path = JSON_raw.path;
				this.log.info("jsonraw: " + JSON.stringify(JSON_raw));
				//const JSON_serialnumber = JSON_raw.serialNumber;
				this.log.info("serialpath: " + JSON_path);
				//this.log.info("JSON_serialnumber: " + JSON_serialnumber);
				//this.setState("usb.serialnumber", JSON_serialnumber.toString(), true);
			})
			.catch((_err) => {
				this.log.warn("Error getting serialport list");
			});

		this.log.info("[START] Starting wallboxamo adapter");
		this.log.info("Config timer	: " + this.config.conf_interval);
		this.NIntervallStatus = this.config.conf_interval;

		await this.set_objects();
		this.func_setintervall();
	}

	writeserialinfo(insert) {
		try {
			const raw_ports = insert[0];
			const JSON_path = JSON.stringify(raw_ports.path);
			const JSON_productId = JSON.stringify(raw_ports.productId);
			const JSON_vendorId = JSON.stringify(raw_ports.vendorId);
			//const JSON_serialNumber = JSON.stringify(raw_ports.device);

			this.log.info(
				"Json_Path: " + JSON_path + " Json_Product ID: " + JSON_productId + " Json_vendor ID: " + JSON_vendorId,
			);

			this.setState("device-usb.raw", JSON.stringify(raw_ports), true);
			this.setState("device-usb.port", JSON_path, true);
			this.setState("device-usb.vendorId", JSON_vendorId, true);
			this.setState("device-usb.productId", JSON_productId, true);
		} catch (err) {
			this.log.error("error1: " + err);
		}
	}

	func_setintervall() {
		try {
			this.NIntervallStatus = this.config.conf_interval * 1000;
			if (this.NIntervallStatus > 0 || this.NIntervallStatus < 60) {
				this.abl_watchdog_status = this.setInterval(async () => {
					this.log.debug("timer");
				}, this.NIntervallStatus);
			}
		} catch (error) {
			this.log.info("error: " + error);
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			if (this.abl_watchdog_status) {
				clearInterval(this.abl_watchdog_status);
			}
			this.log.info("[END] Stopping " + " " + adapterName + " " + "adapter...");
			this.setState("info.connection", false, true);
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state && state.ack) {
			// The state was changed
			const idParts = id.split(".");
			this.log.info("typeof state: " + typeof state);
			try {
				if (state) {
					this.log.info("id: " + JSON.stringify(id));
					const id_value = idParts[3];
					this.log.info("id_value: " + id_value);

					const current_value = state.val?.toString();
					const IACommandSettingRow = this.ACommandSetting.findIndex((row) => row.includes(id_value));
					const BTimer = this.ACommandSetting[IACommandSettingRow][2];
					const BCheckCurrentAnswer = this.ACommandSetting[IACommandSettingRow][3];

					//ACommandSetting
					//this.ACurrentSetting

					switch (id_value) {
						case "current":
							if (BTimer == true) {
								if (this.abl_watchdog_status) {
									this.log.info("stop timer");
									clearInterval(this.abl_watchdog_status);
								}
							}
							if (current_value != null) {
								const index_AACurrentAdress = parseInt(current_value) - 6;
								this.log.info("index_AACurrentAdress: " + index_AACurrentAdress);
								const AAdresse = this.ACurrentAdress[index_AACurrentAdress];

								this.log.info("send current: " + current_value);
								this.log.info("Timer status: " + BTimer);
								this.log.info("BCheckCurrentAnswer: " + BCheckCurrentAnswer);

								this.SendSerial(AAdresse);
							}
							break;
						default:
							this.func_setintervall();
							this.log.info("Timer status: " + BTimer);
							this.log.info("BCheckCurrentAnswer: " + BCheckCurrentAnswer);
					}

					//this.BStatusControll = true;
					//	this.log.info("hier wäre der neue timer aufrufe");
				} else {
					this.log.info(`state ${id} deleted`);
				}
			} catch (e) {
				this.log.debug("OnStateChange: " + e);
			}
		}
	}

	SendSerial(AdresseSerialOut) {
		const a = AdresseSerialOut;
		this.log.info("SendSerial _a: " + a + " func_setintervall");
		this.func_setintervall();
	}

	//If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.p
	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.messagebox" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	onMessage(obj) {
		if (obj) {
			this.log.debug("object list uart");
			switch (obj.command) {
				case "listUart":
					if (obj.callback) {
						if (SerialPort) {
							// read all found serial ports
							SerialPort.list().then((ports) => {
								this.writeserialinfo(ports);
								ports = this.listSerial(ports);
								this.log.debug(`List of port: ${JSON.stringify(ports)}`);
								this.log.info("Usb-Stick found");
								this.sendTo(obj.from, obj.command, ports, obj.callback);
							});
						} else {
							this.log.warn("Module serialport is not available");
							this.sendTo(obj.from, obj.command, [{ path: "Not available" }], obj.callback);
						}
					}
					break;
			}
		}
	}

	listSerial(ports) {
		ports = ports || [];
		const path = require("node:path");
		fs = fs || require("node:fs");

		// Filter out the devices that aren"t serial ports
		const devDirName = "/dev";

		let result;
		try {
			this.log.info(`Verify ${JSON.stringify(ports)}`);
			result = fs
				.readdirSync(devDirName)
				.map((file) => path.join(devDirName, file))
				.filter(this.filterSerialPorts)
				.map((port) => {
					let found = false;
					for (let v = 0; v < ports.length; v++) {
						if (ports[v].path === port) {
							found = true;
							break;
						}
					}
					this.log.info(`Check ${port} : ${found}`);

					!found && ports.push({ path: port });

					return { path: port };
				});
		} catch (e) {
			if (require("node:os").platform() !== "win32") {
				this.log.error(`Cannot read "${devDirName}": ${e}`);
			}
			result = ports;
		}
		return result;
	}

	filterSerialPorts(path) {
		fs = fs || require("node:fs");
		// get only serial port names
		if (!/(tty(S|ACM|USB|AMA|MFD|XR)|rfcomm)/.test(path)) {
			return false;
		}
		return fs.statSync(path).isCharacterDevice();
	}

	set_objects() {
		try {
			this.setObjectNotExistsAsync("info.connection", {
				type: "state",
				common: {
					name: "connection usb-Modbus",
					type: "boolean",
					role: "indicator.connected",
					read: true,
					write: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("device-usb.port", {
				type: "state",
				common: {
					name: "port",
					type: "string",
					role: "info.port",
					desc: {
						en: "Provides information about the port name used.",
						de: "Gibt Informationen über den genutzen Portnamen.",
					},
					read: true,
					write: false,
					def: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("device-usb.port-open", {
				type: "state",
				common: {
					name: "port-open",
					type: "boolean",
					desc: {
						en: "Informs about the connection status of the port",
						de: "Informiert über den Verbindungsstauts des Ports",
					},
					role: "indicator.rechable",
					read: true,
					write: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("device-usb.raw", {
				type: "state",
				common: {
					name: "port",
					type: "string",
					role: "JSON",
					desc: {
						en: "Gives information about the raw data of the USB device",
						de: "Gibt Information über die Rohdaten des Usb Gerät",
					},
					read: true,
					write: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("device-usb.vendorId", {
				type: "state",
				common: {
					name: "vendorId",
					type: "string",
					role: "info.serial",
					desc: {
						en: "Gives information about the vendorId of the USB device",
						de: "Gibt Information über den Gerätehersteller des Usb Gerät",
					},
					read: true,
					write: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("device-usb.productId", {
				type: "state",
				common: {
					name: "device-usb.productid",
					type: "string",
					role: "JSON",
					desc: {
						en: "Gives information about the product ID of the USB device",
						de: "Gibt Information über die Product ID des Usb Gerät",
					},
					read: true,
					write: false,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("send.unlock", {
				type: "state",
				common: {
					name: "send.unlock",
					type: "boolean",
					role: "button",
					desc: {
						en: "send command to unlock the wallbox",
						de: "Sendet einen Befehl zum Öffnen der Wallbox",
					},
					read: true,
					write: true,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("send.reset", {
				type: "state",
				common: {
					name: "send reset",
					type: "boolean",
					role: "button",
					desc: {
						en: "send command to reset the wallbox",
						de: "Sendet einen Befehl zum Resetten der Wallbox",
					},
					read: true,
					write: true,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("send.current", {
				type: "state",
				common: {
					name: "send.current",
					type: "number",
					role: "level.current",
					min: 6,
					max: 16,
					unit: "A",
					desc: {
						en: "send new current value to wallbox",
						de: "Sendet neuen Strom Wert zur Wallbox",
					},
					read: true,
					write: true,
					step: 1,
					def: 11,
				},
				native: {},
			});

			this.setObjectNotExistsAsync("send.locked", {
				type: "state",
				common: {
					name: "send.locked",
					type: "boolean",
					role: "button",
					desc: {
						en: "send close command to wallbox",
						de: "Sendet das Deaktivieren der Wallbox",
					},
					read: true,
					write: true,
				},
				native: {},
			});
		} catch (e) {
			this.log.debug("create datapoints: " + e);
		}
	}
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Wallboxamo(options);
} else {
	// otherwise start the instance directly
	new Wallboxamo();
}
