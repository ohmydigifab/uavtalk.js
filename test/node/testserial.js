var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;
var Uavtalk = require("uavtalk");

var serial = new SerialPort("/dev/ttyAMA0", {
	baudrate : 57600
});

var objMan = Uavtalk.ObjectManager("./openpilot_definitions");
var packetHandler = Uavtalk.PacketHandler();
serial.on("open", function() {
	serial.on("data", packetHandler.unpack(function(packet) {
		if (!objMan.ready()) {
			return;
		}
		var data = objMan.decode(packet);
		if (!data) {
			return;
		}
		console.log(data.name);
		// dataemitter.emit(data.name,data);
	}));

	var gtsObj = objMan.getInstance("GCSTelemetryStats");
	var ftsObj = objMan.getInstance("FlightTelemetryStats");
	if (ftsObj && ftsObj.Status == 0) {
		gtsObj.Status == 1;
		serial.write(packetHandler.pack(gtsObj));
	}
});
