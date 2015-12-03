var EventEmitter = require('events').EventEmitter;
var SerialPort = require("spport").SerialPort;
var Uavtalk = require("uavtalk");

var objMan = Uavtalk.ObjectManager("./openpilot_definitions");
objMan.init(function() {
	var sp = new SerialPort("/dev/ttyAMA0", {
		baudrate : 57600
	});
	objMan.output_stream = function(data) {
		console.log(data);
		sp.write(data, function() {
			sp.drain(callback);
		});
	}
	sp.on("data", objMan.input_stream());
	sp.on("open", function() {

		objMan.requestInstance("GCSTelemetryStats", function(gtsObj) {
			console.log(gtsObj);
			objMan.requestInstance("FlightTelemetryStats", function(ftsObj) {
				console.log(ftsObj);
				if (ftsObj && ftsObj.Status == 0) {
					gtsObj.Status == 1;
					objMan.updateInstance(gtsObj);
				}
			});
		});
	});
});
