
var playMap = {
    types: {
        marker: "marker",
        bubble: "bubble",
        heatmap: "heatmap"
    },
    events: {
        // timeTick event fired for each update, the current time value is passed to the handler
        timeChanged: "timeChanged",
        dataReady: "dataReady",
        requiresMoreData: "requiresMoreData",
        endOfData: "endOfData"
    }
};

function inheritMethods(object, copyObject, constructorName) {
    var method;
    // public methods
    var methods = copyObject.prototype;
    for(method in methods) {
        if(object.prototype[method] === undefined) {
            object.prototype[method] = methods[method];
        }
    }
    // inherit constructor if specified
    if(constructorName) {
        object.prototype[constructorName] = copyObject;
    }
}

playMap.eventHandlers = function() {
    var that = this;
    that._listeners = {};
    that._fireEvent = function(type, data) {
        if(type) {
            var listeners = that._listeners[type];
            if(listeners == undefined) {
            } else {
                var index = 0;
                var length = listeners.length;
                for(; index < length; index++) {
                    listeners[index](data);
                }
            }
        }
    }
}

playMap.eventHandlers.prototype.addEventListener = function(type, listener) {
    if(listener && type) {
        if(this._listeners[type] == undefined) {
            this._listeners[type] = [];
        }
        this._listeners[type].push(listener)
    }
}

playMap.eventHandlers.prototype.removeListener = function(listener, type) {
    if(listener && type) {
        var listeners = this._listeners[type];
        if(listeners == undefined) {
        } else {
            var index = 0;
            var length = listeners.length;
            for(; index < length; index++) {
                if(listeners[index] == listener) {
                    delete listeners[index];
                    return;
                }
            }
        }
    }
}

// provides a timer with a refresh function
playMap.PlayMap = function(map) {
    this.superEventHandlers();
    // private fields and methods
    var player = this;
    player._map = map;
    player._dataRows = [];
    // continuous mode fields
    player._paused = true;
    player._timerIncrement = 1000.0;
    // step by step mode fields
    player._tolerance = 0;
    // set to 0 to start but reinitialised based on the data
    player._currentTime = 0;
    player._markerOptions = {};
    player._polylineOptions = {};
    player._refresh = function() {
        // scan all data
        // display with nearest to current value
        var entityName;
        var dataRows = player._dataRows;
        for(entityName in dataRows) {
            player._updateEntity(dataRows[entityName]);
        }
        if(player._currentTime > player._stopTime) {
            player._fireEvent(playMap.events.endOfData);
        }
    }
    player._updateEntity = function(entity) {
        var row;
        var entityDataRows;
        var entityDataLength;
        var index;
        // find first row with time crossing the currentTime
        entityDataRows = entity.data;
        entityDataLength = entityDataRows.length;
        if(entityDataLength == 0) {
            return;
        }
        // only one item
        if(entityDataLength == 1) {
            player._updateOverlay(0, entity, true);
            return;
        }
        // before the first item
        row = entityDataRows[0];
        if(player._currentTime < row.time) {
            player._updateOverlay(0, entity, true);
            return;
        }
        for(index = 1; index < entityDataLength; index++) {
            row = entityDataRows[index];
            // find first intersection
            if(player._currentTime < row.time) {
                player._updateOverlay(index, entity, false);
                return;
            }
        }
        // after the last item
        if(index == entityDataLength) {
            player._updateOverlay(index - 1, entity, true);
            return;
        }
    }

    player._updateOverlay = function(index, entity, fixed) {
        var row = entity.data[index];
        if(entity.overlay == null) {
            entity.overlay = player._createOverlay(row.geometry, entity.options.type);
            // force refresh of overlay geometry
            entity.currentIndex = null;
            // set trace if required
            if(entity.trace) {
                entity.overlay.setTrace(entity.trace.on || false, entity.trace.options);
            }
        }
        // if the point is a fixed point (unique, before first or after last)
        // whether or not it needs redrawing depends on the overlay and the currentIndex
        // if overlay is null, create overlay
        // if currentIndex is different from index, refresh overlay
        if(fixed) {
            player._updateOverlayGeometry(entity.overlay, row.geometry);
        // if not fixed, the marker is between the current index and the following one
        } else {
            var previousRow = entity.data[index - 1];
            // check if entity option is defined and interpolated setting is true
            if(entity.options && entity.options.interpolated === true) {
                // use interpolate function
                var geometry = player._interpolateGeometry(previousRow, row);
                player._updateOverlayGeometry(entity.overlay, geometry);
            } else {
                // geometry hasn't changed, do nothing
                if(index == entity.currentIndex) {
                } else {
                    // check which is the nearest
                    // update geometry
                    player._updateOverlayGeometry(entity.overlay, row.geometry);
//                    updateIndex();
                }
            }
        }
        // update index if it has changed
        if(entity.currentIndex != index) {
            updateIndex();
        }
        function updateIndex() {
            // update current geometry index
            entity.currentIndex = index;
            entity.overlay.updateData(row.data);
            // refresh trace path if required
            if(entity.trace && entity.trace.on && entity.trace.on === true) {
                // create geometry array based on trace length and current index
                // at the very least add the current and previous position
                if(index > 0) {
                    var previousRow = entity.data[index - 1];
                    var path = [row.geometry, previousRow.geometry];
                    entity.overlay.setTracePath(path);
                }
            }
        }
    }
    player._interpolateGeometry = function(firstRow, nextRow) {
        var firstGeometry = firstRow.geometry;
        var nextGeometry = nextRow.geometry;
        var firstTime = firstRow.time;
        var nextTime = nextRow.time;
        var currentTime = player._currentTime;
        var fraction = (currentTime - firstTime) / (nextTime - firstTime);
        if(firstGeometry.lat) {
            return google.maps.geometry.spherical.interpolate(firstGeometry, nextGeometry, fraction);
        } else {

        }
        return firstGeometry;
    }
    // create the entity overlay using the options passed
    player._createOverlay = function(geometry, options) {
        options = (options || {});
        var overlay = null;
        var type = options.type;
        if(type == undefined) {
            overlay = playMap.overlays.createDefault(geometry);
        } else {
            overlay = new playMap.overlays[type](options.options);
        }
        overlay.setMap(this._map);
        return overlay;
    }
    player._updateOverlayGeometry = function(overlay, geometry) {
        // geometry is either a LatLng coordinate or a MVCArray path
        if(geometry.lat) {
            overlay.setPosition(geometry);
        } else if(geometry.getArray) {
            overlay.setPath(geometry);
        }
    }
    player._pushData = function(entity, data, timeIndex, geometryIndex, displayOptions) {
        // if timeIndex is not specified, it is assumed to be the first column
        timeIndex = timeIndex || 0;
        // if geometryIndex is not specified, it is assumed to be the second column
        geometryIndex = geometryIndex || 1;
        // if entityIndex is not specified, it is assumed all fields are from the same entity
        // default entity name
        var entityName;
        var entityIndex;
        if(typeof entity == 'string') {
            entityName = entity;
        } else if(!isNaN(entity)) {
            entityIndex = entity;
        } else {
            entityName = "entity";
        }
        // variables
        var row;
        var rowIndex = 0;
        var numberOfRows = data.length;
        var dataRows = player._dataRows;
        for(; rowIndex < numberOfRows; rowIndex++) {
            row = data[rowIndex];
            if(entityIndex != undefined) {
                entityName = row[entityIndex];
            }
            if(dataRows[entityName] == undefined) {
                // create new entry for the entity
                dataRows[entityName] = {
                    currentIndex: null,
                    overlay: null,
                    options: displayOptions,
                    data: []
                };
            }
            // add the row to the entry data
            dataRows[entityName].data.push({
                    time: playMap.parseTime(row[timeIndex]),
                    geometry: playMap.parseGeometry(row[geometryIndex]),
                    data: row
                });
        }
        // order data by time occurence
        function compare(a, b) {
            return (a.time < b.time ? -1 : 1);
        }

        // order for each entity
        for(entityName in dataRows) {
            dataRows[entityName].data.sort(compare);
        }

        var entityRows;
        var length;
        var startTime;
        var stopTime;
        var currentTime;
        // update start and end time
        for(entityName in dataRows) {
            entityRows = dataRows[entityName].data;
            length = entityRows.length;
            if(startTime == undefined || startTime > entityRows[0].time) {
                startTime = entityRows[0].time;
            }
            if(stopTime == undefined || stopTime < entityRows[length - 1].time) {
                stopTime = entityRows[length - 1].time;
            }
        }
        player._startTime = startTime;
        player._stopTime = stopTime;
        // update current time if not within range
        if(currentTime == undefined) {
            currentTime = startTime;
            player.setCurrentTime(currentTime);
        }
        // fire an "dataReady" event
        player._fireEvent(playMap.events.dataReady);
    }
    player._setEntityDisplayOptions = function(entityName, options) {
        var entity = this._dataRows[entityName];
        if(options) {
            if(options.trace) {
                entity.trace = options.trace;
                if(entity.overlay) {
                    entity.overlay.setTrace(options.trace.on || false, options.trace.options);
                }
            }
            if(options.interpolated != undefined) {
                entity.interpolated = options.interpolated;
            }
            if(options.path) {
            }
            if(options.type) {
                entity.type = options.type;
                // force refresh of overlay
                entity.overlay = null;
            }
        }
    }
    player._setEntityVisible = function(entityName, visible) {
        var entity = player._dataRows[entityName];
        if(entity) {
            if(entity.overlay) {
                if(visible === true) {
                    entity.overlay.show();
                } else {
                    entity.overlay.hide();
                }
            }
        }
    }
    player._cleanUp = function() {
        var entity;
        var dataRows = player._dataRows;
        for(var entityName in dataRows) {
            entity = dataRows[entityName];
            if(entity.overlay) {
                entity.overlay.setMap(null);
            }
        }
        player._dataRows = {};
    }
}
//inheritMethods(playMap.PlayMap, playMap.eventHandlers);
inheritMethods(playMap.PlayMap, playMap.eventHandlers, "superEventHandlers");

playMap.PlayMap.prototype.pushEntityData = function(entityName, data, timeIndex, geometryIndex, displayOptions) {
    this._pushData(entityName, data, timeIndex, geometryIndex, displayOptions);
}

// add a mixed array of values to the current data store
playMap.PlayMap.prototype.pushData = function(entityIndex, data, timeIndex, geometryIndex, displayOptions) {
    this._pushData(entityIndex, data, timeIndex, geometryIndex, displayOptions);
}

playMap.PlayMap.prototype.getEntities = function() {
    return this._dataRows;
}

playMap.PlayMap.prototype.setEntityVisibility = function(visible, entityName) {
    if(entityName) {
        this._setEntityVisible(entityName, visible);
    } else {
        // scan through all entities
        var dataRows = this._dataRows;
        for(entityName in dataRows) {
            this._setEntityVisible(entityName, visible);
        }
    }
}

// set the display options as {traces: , interpolated: boolean, path: {boolean, displayOptions}, type: {type: ("marker" (points), "bubble" (points), "heatmap" (points), "filledPolygon" (polygon)), options: }
playMap.PlayMap.prototype.setDisplayOptions = function(options, entityName) {
    options = options || {};
    // if no entity name is provided, options apply to all entities
    if(entityName) {
        this._setEntityDisplayOptions(entityName, options);
    } else {
        // scan through all entities
        var dataRows = this._dataRows;
        var name;
        for(name in dataRows) {
            this._setEntityDisplayOptions(name, options);
        }
    }
}

playMap.PlayMap.prototype.getDisplayOptions = function(entityName) {
    if(entityName) {
        return this._dataRows[entityName].options;
    }
}

playMap.PlayMap.prototype.getStartTime = function() {
    return this._startTime;
}

playMap.PlayMap.prototype.getStopTime = function() {
    return this._stopTime;
}

playMap.PlayMap.prototype.cleanUp = function() {
    this._cleanUp();
}

playMap.PlayMap.prototype.setCurrentTime = function(currentTime) {
    this._currentTime = currentTime;
    // fire event with the time value
    this._fireEvent(playMap.events.timeChanged, this._currentTime);
    // refresh the display
    this._refresh();
}

playMap.PlayMap.prototype.getCurrentTime = function() {
    return this._currentTime;
}

playMap.ContinuousPlayMap = function(map, resfreshInterval) {
    this.superPlayMap(map);
    var player = this;
    // the function called for each time iteration, in continuous mode
    player._tick = function() {
        if(!player._paused) {
            player.setCurrentTime(player._currentTime + player._timerIncrement);
        }
    }
    player._intervalTimer = setInterval(player._tick, resfreshInterval || 1000.0);
}

inheritMethods(playMap.ContinuousPlayMap, playMap.PlayMap, "superPlayMap");

playMap.ContinuousPlayMap.prototype.getTimerIncrement = function() {
    return this._timerIncrement;
}

playMap.ContinuousPlayMap.prototype.setTimerIncrement = function(timerIncrement) {
    this._timerIncrement = timerIncrement;
}

playMap.ContinuousPlayMap.prototype.play = function() {
    this._paused = false;
}

playMap.ContinuousPlayMap.prototype.pause = function() {
    this._paused = true;
}

playMap.DiscretePlayMap = function(map, userOptions) {
    this.superPlayMap(map, userOptions);
}

inheritMethods(playMap.DiscretePlayMap, playMap.PlayMap, "superPlayMap");

playMap.parseTime = function(time) {
    if(time.getTime) {
        return time.getTime();
    } else {
        var timeValue = (new Date(time * 1000.0)).getTime();
        if(!isNaN(timeValue)) {
            return timeValue;
        } else {
            throw new Error("Error in data time field is not a valid time value");
        }
    }

}

playMap.parseGeometry = function(txt) {
    // check if already a geometry object
    if(typeof txt == "object") {
        // already a Google geometry object
        if(txt.lat || txt.getArray) {
            return txt;
        }
    }
    if(typeof txt == "string") {
        // check if simple pair of coordinates
        var pattern = new RegExp("[^0-9.\s,]", 'g');
        if(txt.match(pattern)) {
            if(txt.split(' ').length == 2) {
                return createLatLng(txt.split(' '));
            } else if(txt.split(',').length == 2) {
                return createLatLng(txt.split(','));
            }
        }
        // check if XML
        var xmlDoc;
        var parser;
        if (window.DOMParser)
        {
            var parser=new DOMParser();
            xmlDoc=parser.parseFromString(txt,"text/xml");
        }
        else // Internet Explorer
        {
            xmlDoc=new ActiveXObject("Microsoft.XMLDOM");
            xmlDoc.async="false";
            xmlDoc.loadXML(txt);
        }
        // check if KML
        if(xmlDoc.getElementsByTagName("kml")) {
            if(xmlDoc.getElementsByTagName("Point")) {
                var point = xmlDoc.getElementsByTagName("Coordinates")[0].childNodes[0].nodeValue;
                var coordinates = point.split(',');
                return createLatLng(coordinates);
            } else if(xmlDoc.getElementsByTagName("LineString")) {
                var lines = xmlDoc.getElementsByTagName("LineString")[0].getElementsByTagName("Coordinates")[0].childNodes[0].nodeValue;
                var lineCoordinates = lines.coordinates.split(',');
                return createMVCArray(lineCoordinates);
            } else if(xmlDoc.getElementsByTagName("Polygon")) {
                var polygon = xmlDoc.getElementsByTagName("LinearRing")[0].getElementsByTagName("Coordinates")[0].childNodes[0].nodeValue;
                var polygonCoordinates = polygon.coordinates.split(',');
                return createMVCArray(polygonCoordinates);
            }
        }
    }
    // default
    throw new Error("Error in geometry field, geometry is not a supported geometry type");
    
    function createLatLng(coordinates, reversed) {
        var lat = parseFloat(coordinates[(reversed ? 0 : 1)]);
        var lng = parseFloat(coordinates[(reversed ? 1 : 0)]);
        if(isNaN(lat) || isNaN(lng)) {
            return null;
        } else {
            return new google.maps.LatLng(lat, lng);
        }
    }
    function createMVCArray(coordinates, reversed) {
        var mvcArray = new MVCArray();
        var index = 0;
        var length = coordinates.length;
        for(; index < length; index+=3) {
            mvcArray.push(createLatLng(coordinates, reversed));
        }
    }
}

playMap.overlays = {};

playMap.overlays.createDefault = function(geometry) {
    var overlay;
    // geometry is either a LatLng coordinate or a MVCArray path
    if(geometry.lat) {
        overlay = new playMap.overlays.genericMarker();
    } else if(geometry.getArray) {
        overlay = new google.maps.Polyline();
    }
    return overlay;
}

playMap.overlays.genericOverlay = function(options, map) {
    this.superEventHandler();
    options = options || {};
    this.info_ = options.info;
    if(map) {
        this.setMap(map);
    }
    this.div_ = null;
    // field for the currently displayed data row
    this.currentData_ = null;
    // field for the trace overlay
    // it is down to the subclasses to set this field or not
    this.traceOverlay_ = null;
}

playMap.overlays.genericOverlay.prototype = new google.maps.OverlayView();

// add event handler functionality
inheritMethods(playMap.overlays.genericOverlay, playMap.eventHandlers, "superEventHandler");

playMap.overlays.genericOverlay.prototype.getData = function(data) {
    return this.currentData_;
}

playMap.overlays.genericOverlay.prototype.updateData = function(data) {
    this.currentData_ = data;
}

playMap.overlays.genericOverlay.prototype.hide = function() {
    if (this.div_) {
        this.div_.style.visibility = "hidden";
    }
}

playMap.overlays.genericOverlay.prototype.show = function() {
    if (this.div_) {
        this.div_.style.visibility = "visible";
    }
}

playMap.overlays.genericOverlay.prototype.onRemove = function() {
    if(this.div_) {
        this.div_.parentNode.removeChild(this.div_);
        this.div_ = null;
    }
}


// static method
playMap.overlays.genericOverlay.displayInfoWindow = function(that) {
    // add a click handler on the div
    if(that.info_) {
        var info = that.info_;
        that.infoWindow_ = that.infoWindow_ || new google.maps.InfoWindow();
        if(typeof info === "string") {
            that.infoWindow_.setContent(info);
        }
        if(typeof info === "function") {
            that.infoWindow_.setContent(info(that.getData()));
        }
        that.infoWindow_.open(that.getMap(), that);
    }
}

playMap.overlays.genericOverlay.prototype.getPosition = function() {
    return this.position_;
}

playMap.overlays.genericOverlay.prototype.setPosition = function(position) {
    this.position_ = position;
    this.draw();
}

playMap.overlays.genericOverlay.prototype.setTrace = function(enabled) {
    // does nothing, it is up to the subclasses to implement this method
}

// this is the equivalent of a light weight marker
playMap.overlays.imageOverlay = function(options, map) {
    this.superGenericOverlay(options, map);
    options = options || {};
    this.image_ = (options.image || './bubble.png');
}

inheritMethods(playMap.overlays.imageOverlay, playMap.overlays.genericOverlay, "superGenericOverlay");

playMap.overlays.imageOverlay.prototype.onAdd = function() {

    var that = this;
    // Create the DIV and set some basic attributes.
    var div = document.createElement('DIV');
    div.style.width = "32px";
    div.style.height = "32px";
    div.style.border = "none";
    div.style.borderWidth = "0px";
    div.style.position = "absolute";

    // Create an IMG element and attach it to the DIV.
    var img = document.createElement("img");
    if(typeof that.image_ == "function") {
        // will get updated later
        img.src = null;
    } else {
        img.src = that.image_;
    }
    img.style.width = "100%";
    img.style.height = "100%";
    div.appendChild(img);
    that.imgElement_ = img;
    that.imgElement_.onclick = function(){
        that._fireEvent('click');
    };
    if(that.info_) {
        that.addEventListener('click', function() {playMap.overlays.genericOverlay.displayInfoWindow(that);});
    }

    // Set the overlay's div_ property to this DIV
    that.div_ = div;

    // We add an overlay to a map via one of the map's panes.
    // We'll add this overlay to the overlayImage pane.
    var panes = that.getPanes();
    panes.overlayLayer.appendChild(div);
}
playMap.overlays.imageOverlay.prototype.draw = function() {

    var that = this;
    // check map and positions have been set
    if(that.position_ && that.getMap()) {
        // We need to retrieve the projection from this overlay to do this.
        var overlayProjection = that.getProjection();

        if(overlayProjection) {
            // Retrieve the northeast coordinates of this overlay
            // in latlngs and convert them to pixels coordinates.
            // We'll use these coordinates to resize the DIV.
            var coordinates = overlayProjection.fromLatLngToDivPixel(that.position_);

            // Resize the image's DIV to fit the indicated dimensions.
            var div = that.div_;
            div.style.left = coordinates.x + 'px';
            div.style.top = coordinates.y + 'px';

            // check if image has changed
            if(typeof that.image_ == "function") {
                that.imgElement_.src = that.image_(that.currentData_);
            }
        }
    }
}

playMap.overlays.imageOverlay.prototype.setTrace = function(enabled, options) {
    // if enabled and no trace already exists, create a polyline
    if(enabled == true) {
        if(this.traceOverlay_ == null) {
            this.traceOverlay_ = new google.maps.Polyline();
            this.traceOverlay_.setMap(this.getMap());
            // force option settings
            options = options || {};
        }
        if(options) {
            this.traceOverlay_.setOptions({clickable: true, geodesic: true, strokeColor: (options.strokeColor || "#FAA"), strokeOpacity: (options.strokeOpacity || 0.7), strokeWeight: (options.strokeWeight || 3)});
        }
    } else {
        if(this.traceOverlay_ != null) {
            this.traceOverlay_.setMap(null);
            this.traceOverlay_ = null;
        }
    }
}

playMap.overlays.imageOverlay.prototype.setTracePath = function(path) {
    if(path && this.traceOverlay_ != null) {
        this.traceOverlay_.setPath(path);
    }
}

playMap.overlays.genericMarker = function(map, options) {
    this.superGenericOverlay(options, map);
}

playMap.overlays.genericMarker.prototype = new google.maps.Marker();

inheritMethods(playMap.overlays.genericMarker, playMap.overlays.genericOverlay, "superGenericOverlay");

playMap.overlays.genericMarker.prototype.show = function() {
    this.setVisible(true);
}

playMap.overlays.genericMarker.prototype.hide = function() {
    this.setVisible(false);
}

playMap.overlays.genericMarker.prototype.draw = function() {
}

// Bar Chart display using canvas
playMap.overlays.barChart = function(options, map) {
    this.superGenericOverlay(options, map);
    this.canvas_ = null;
    this.height_ = options.height;
}

inheritMethods(playMap.overlays.barChart, playMap.overlays.genericOverlay, "superGenericOverlay");

playMap.overlays.barChart.prototype.onAdd = function() {

    var that = this;
    // Create the DIV and set some basic attributes.
    var div = document.createElement('DIV');
    div.style.width = "60px";
    div.style.height = "32px";
    div.style.border = "none";
    div.style.borderWidth = "0px";
    div.style.position = "absolute";

    // Create a canvas element and attach it to the DIV.
    var canvas = document.createElement("canvas");
    canvas.style.width = "60px";
    canvas.style.height = "32px";
    div.appendChild(canvas);
    that.canvas_ = canvas;
    that.div_.onclick = function(){
        that._fireEvent('click');
    };
    if(that.info_) {
        that.addEventListener('click', function() {playMap.overlays.genericOverlay.displayInfoWindow(that);});
    }

    // Set the overlay's div_ property to this DIV
    that.div_ = div;

    // We add an overlay to a map via one of the map's panes.
    // We'll add this overlay to the overlayImage pane.
    var panes = that.getPanes();
    panes.overlayLayer.appendChild(div);
}
playMap.overlays.barChart.prototype.draw = function() {

    var that = this;
    // check map and positions have been set
    if(that.position_ && that.getMap()) {
        // We need to retrieve the projection from this overlay to do this.
        var overlayProjection = that.getProjection();

        if(overlayProjection) {
            // Retrieve the northeast coordinates of this overlay
            // in latlngs and convert them to pixels coordinates.
            // We'll use these coordinates to resize the DIV.
            var coordinates = overlayProjection.fromLatLngToDivPixel(that.position_);

            // Resize the image's DIV to fit the indicated dimensions.
            var div = that.div_;
            div.style.left = coordinates.x + 'px';
            div.style.top = coordinates.y + 'px';

            // redraw the barGraph
            if(typeof that.height_ == "function") {
                playMap.overlays.draw3DBar(that.canvas_, that.height_(that.currentData_));
            }
        }
    }
}
playMap.overlays.draw3DBar = function(canvas, value) {
    var ctx = canvas.getContext('2d');
    // clean the canvas
    ctx.fillStyle = "rgba(255, 255, 255, 0)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(100, 100, 100, 1)";
    // draw the barGraph
    var height = Math.min(value, 150);
    // add a shadow first
//    ctx.shadowOffsetX = 2;
//    ctx.shadowOffsetY = 2;
//    ctx.shadowBlur = 2;
//    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    // now draw the rectangle
    ctx.fillStyle = "rgba(100, 255, 100, 1)";
    ctx.fillRect(0, 0, 20, height);
    ctx.strokeRect(0, 0, 20, height);
}
