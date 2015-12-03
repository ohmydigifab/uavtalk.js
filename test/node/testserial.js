var EventEmitter = require('events').EventEmitter;
var SerialPort = require("serialport").SerialPort;
var Uavtalk = require("uavtalk");

var serial = new SerialPort("/dev/ttyAMA0", {
	baudrate : 57600
});

var objMan = Uavtalk.ObjectManager("./openpilot_definitions");
objMan.output_stream = function(data)
{
	serial.write(data);
}
serial.on("open", function() {
	serial.on("data", objMan.input_stream());

	var gtsObj = objMan.getInstance("GCSTelemetryStats");
	var ftsObj = objMan.getInstance("FlightTelemetryStats");
	if (ftsObj && ftsObj.Status == 0) {
		gtsObj.Status == 1;
		objMan.updateInstance(gtsObj);
	}
});
