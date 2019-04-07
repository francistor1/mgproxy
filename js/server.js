/**
 * 
 */

// Configuration parameters
const retrievalIntervalSeconds = 10;
const stalledIntervalSeconds = 11;
const requestTimeoutMillis = 3000;

const Koa = require('koa');
var rp = require('request-promise-native');
const fs = require('fs');

/* The "allMetrics" object has the form
* {
* 		"storeName": {
* 			"metricName": {
* 				[
* 					{"retreivalTimestamp": <date>, "metricData": <object>},
* 					{"retreivalTimestamp": <date>, "metricData": <object>}
* 				]
* 			}
* 		}
* }
*/
var allMetrics = {};

const app = new Koa();
app.use(ctx => {
	ctx.body = ctx.request.url;
});

app.listen(3000);

getAllMetrics();

var retrievalTimer = setInterval(getAllMetrics, retrievalIntervalSeconds * 1000);
var stalledTimer = setInterval(cleanup, stalledIntervalSeconds * 1000);

function getAllMetrics() {
	
	console.log(JSON.stringify(allMetrics, null, 2));
	console.log();
	
	fs.readFile('conf/stores.json', 'utf8', function(err, contents) {
		if(err) console.error(new Date(), err.message);
		else {
			for(storeEntry of Object.entries(JSON.parse(contents))){
				for(epIndex = 0; epIndex < storeEntry[1]["endpoints"].length; epIndex++){
					for(metric of storeEntry[1]["metrics"]){
						
						// IIF, because variables in the for loop mutate
						(function(storeEntry, epIndex, metric) {
							
							rp({url: storeEntry[1]["endpoints"][epIndex] + metric.path, timeout: requestTimeoutMillis, json:true}).
							  then(function(res){
								  updateMetric(storeEntry[0], metric.name, epIndex, res);
							  }).
							  catch(function(err){
								  // TODO: Treat timeout
								  updateMetric(storeEntry[0], metric.name, epIndex, {});
								  console.error(err.message);
							  });
						})(storeEntry, epIndex, metric);
						
					}
				}
			}
		}
	});
}

/**
 * Deletes stalled entries
 * 
 * @returns
 */
function cleanup() {
	var timeNow = Date.now();
	for(store of Object.entries(allMetrics)){
		for(metric of Object.entries(store[1])) {
			var metricValues = metric[1];
			for(i = metricValues.length - 1; i >= 0 ; i--){
				// Remove a metric from the array
				if(timeNow - metricValues[i].retrievalTimestamp.getTime() > stalledIntervalSeconds * 1000) metricValues.splice(i, 1);
			}
			// If the array is not emtpy, remove the metric
			if(metricValues.length == 0) delete allMetrics[store[0]][metric[0]];
		}
		if(Object.entries(store).size == 0) delete allMetrics[store[0]];
	}
}

/**
 * Creates or updates an entry in the store.
 * 
 */
function updateMetric(storeName, metricName, endpointIndex, metricObject) {
	if(!allMetrics[storeName]) allMetrics[storeName] = {};
	var store = allMetrics[storeName];
	
	if(!store[metricName]) allMetrics[storeName][metricName] = [];
	var metric = store[metricName];
	
	metric[endpointIndex] = {"retrievalTimestamp": new Date(), "metricData": metricObject};
}