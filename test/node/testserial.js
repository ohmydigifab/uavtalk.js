var EventEmitter = require('events').EventEmitter;
var UavtalkPacketHandler = require("../../uavtalk_packet_handler").UavtalkPacketHandler;
var UavtalkObjectManager = require("../../uavtalk_object_manager").UavtalkObjectManager;
var SerialPort = require("serialport").SerialPort;

var cc3d_serial = new SerialPort("/dev/ttyAMA0", {
	baudrate : 57600
});

var objMan = UavtalkObjectManager("../uavtalk_json");
var packetHandler = UavtalkPacketHandler();

cc3d_serial.on("data", packetHandler.unpack(function(packet) {
	if (!uavtalk_decoder.ready()) {
		return;
	}
	var data = uavtalk_decoder.decode(packet);
	if (!data) {
		return;
	}
	console.log(data.name);
	// dataemitter.emit(data.name,data);
}));

var gtsObj = objMan.getInstance("GCSTelemetryStats");
var ftsObj = objMan.getInstance("FlightTelemetryStats");
if (gtsObj.Status == 0) {
	ftsObj.Status == 1;
}

cc3d_serial.write(packetHandler.pack(gtsObj));