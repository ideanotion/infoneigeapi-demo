$(document).on("pageinit", "#map-page", function () {
    var mapheight = $(document).height();
    var mapOptions = {
        credentials: "AjdTYv3SXpwXQuoO0rq6G4hLvD5p8pK-y8nNT4llHbii0TRIN2u43M8ZCE7M4zTs",
        center: new Microsoft.Maps.Location(45.523085, -73.556152),
        mapTypeId: Microsoft.Maps.MapTypeId.road,
        zoom: 17,
        showScalebar: false,
        showDashboard: true,
        showMapTypeSelector:false,
        disableZooming: false,
        height: mapheight,
        enableSearchLogo: false,
        enableClickableLogo: false,
        disableBirdseye : false,
    }
    $('.map').height(mapheight);
    var colors = [], solidColors = [];
    var loaded = false;
    var curLat = null, curLon = null;
    var selectedCote = null;
    var updateTimer = null;
    var updateAjax = null;
    var parked = false;
    var directionsManager, directionsErrorEventObj, directionsUpdateEventObj;

    colors.push(new Microsoft.Maps.Color(100, 255, 0, 0)); //snowy
    colors.push(new Microsoft.Maps.Color(100, 0, 255, 0)); //plowed
    colors.push(new Microsoft.Maps.Color(100, 255, 255, 0)); //planned
    colors.push(new Microsoft.Maps.Color(100, 255, 255, 0)); // re-planned
    colors.push(new Microsoft.Maps.Color(100, 255, 255, 0)); // future

    solidColors.push(new Microsoft.Maps.Color(255, 255, 0, 0)); //snowy
    solidColors.push(new Microsoft.Maps.Color(255, 0, 255, 0)); //plowed
    solidColors.push(new Microsoft.Maps.Color(255, 255, 255, 0)); //planned
    solidColors.push(new Microsoft.Maps.Color(255, 255, 255, 0)); // re-planned
    solidColors.push(new Microsoft.Maps.Color(255, 255, 255, 0)); // future

    //var cotes = localStorage.getItem("cotes");
    var cotes = null;
    if (cotes === null) {
        cotes = [];
        setTimeout(function () {
            $.mobile.loading('show', {
                text: 'loading...',
                textVisible: true,
                theme: 'a',
            });

            //$.getJSON('http://infoneige.cloudapp.net/cotes/?mode=geo&page_size=1000000', function (data) {			
			// read from the local version
            $.getJSON('js/cote.json', function (response) {
				var data = response.results;
                for (var index in data) {
                    var cote = data[index];
                    cotes[cote.coteRueId] = cote;
                }

                for (var index in cotes) {
                    var cote = cotes[index];
                    var coordinates = []
                    var options = { strokeColor: colors[0], strokeThickness: 3, visible: true };
                    for (var i in cote.geometry.coordinates) {
                        coordinates.push(new Microsoft.Maps.Location(cote.geometry.coordinates[i][1], cote.geometry.coordinates[i][0]));
                    }
                    var polyline = new Microsoft.Maps.Polyline(coordinates, options);

                    //Microsoft.Maps.Events.addHandler(polyline, 'click', (polylineHandler));
                    cote.polyline = polyline;
                    polyline.cote = cote;
                }

                //localStorage.setItem('cotes', cotes);
                $.mobile.loading("hide");
                loaded = true;

                updateTiles();
                if (curLat && curLon) {
                    gotoLocation(curLat, curLon);
                }

            });
        }, 10);
    }


    // init
    var map = new Microsoft.Maps.Map(document.getElementById("mapDiv"), mapOptions);
    Microsoft.Maps.loadModule('Microsoft.Maps.Directions', { callback: function () { directionsManager = new Microsoft.Maps.Directions.DirectionsManager(map); } });
    map.entities.clear();

    // load default snow visibility
    var showSnow = localStorage.getItem("snowLayer") == 'true';
    var snowLayer;
    if (showSnow) {
        snowLayer = new Microsoft.Maps.EntityCollection({ visible: true });
        $('.btn-neige').addClass('ui-btn-active');
    }
    else {
        snowLayer = new Microsoft.Maps.EntityCollection({ visible: false });
    }
    map.entities.push(snowLayer);

    // load pushpins
    var parkedPushpin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(0, 0), { visible: false, icon: 'img/pin-parked.png', width:33, height:48, zIndex:1000 });
    map.entities.push(parkedPushpin);
    var myPushpin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(0, 0), { draggable: true, icon: 'img/pin-car.png', width: 33, height: 48, zIndex: 999 });
    map.entities.push(myPushpin);
    var afterParkedPushpin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(0, 0), { draggable: false, visible: false, icon: 'img/pin-person.png', width: 33, height: 48, zIndex: 998 });
    map.entities.push(afterParkedPushpin);


    // check if parked
    if (localStorage.getItem('parked') != null) {
        parked = true;
        var parkLoc = JSON.parse(localStorage.getItem('parked'));
        parkedPushpin.setOptions({ visible: true });
        parkedPushpin.setLocation(new Microsoft.Maps.Location(parkLoc.lat, parkLoc.lon));
        myPushpin.setOptions({ visible: false });
        afterParkedPushpin.setOptions({ visible: true });

        $('#navbar-1').hide();
        $('#navbar-2').show();
        $('#btn-park-direction').show();
    }

    // GPS
    navigator.geolocation.getCurrentPosition(onSuccess, onFirstTimeError);


    var gotoLocation = function (lat, lon) {
        var center = new Microsoft.Maps.Location(lat, lon);
        map.setView({ zoom: 17, center: center })
    }

    Microsoft.Maps.Events.addHandler(map, 'targetviewchanged', function () {
        var targetZoom = map.getTargetZoom();
        if (targetZoom < 15) {
            map.setView({ zoom: 15 });
        }
    });
    Microsoft.Maps.Events.addHandler(map, 'viewchangeend', function (e) {
        if (loaded) {
            if (updateTimer) {
                clearTimeout(updateTimer);
                updateTimer = null;
            }
            updateTimer = setTimeout(function () {
                updateTiles();
            }, 2000);
        }
        var targetZoom = map.getTargetZoom();
        if (targetZoom >= 18) {
            map.setView({ mapTypeId: Microsoft.Maps.MapTypeId.birdseye, labelOverlay: Microsoft.Maps.LabelOverlay.hidden });
            $(".MicrosoftNav").css('visibility', "visible");
        } else {
            map.setView({ mapTypeId: Microsoft.Maps.MapTypeId.road, labelOverlay: Microsoft.Maps.LabelOverlay.show });
            $(".MicrosoftNav").css('visibility', "hidden");
        }
    });

    var updateTiles = function () {
        if (!showSnow)
            return;

        var bounds = map.getBounds();
        var lat1 = bounds.getNorth()
        var lon1 = bounds.getWest()
        var lat2 = bounds.getSouth()
        var lon2 = bounds.getEast()
        if (updateAjax)
            updateAjax.abort();
        // update streets
        updateAjax = $.getJSON('http://infoneige.cloudapp.net/cotes/?mode=plan&page_size=100000&bbox=' + lon1 + ',' + lat1 + ',' + lon2 + ',' + lat2, function (response) {
			var data = response.results;
            for (var index in cotes) {
                cotes[index].polyline.setOptions({ visible: false });
            }
            for (var index in data) {
                var cote = data[index];
                cotes[cote.coteRueId].plan = cote.plan;
                cotes[cote.coteRueId].polyline.setOptions({ visible: true, strokeColor: colors[cote.plan.etatDeneig] });
                if (!cotes[cote.coteRueId].polyline.added) {
                    snowLayer.push(cotes[cote.coteRueId].polyline);
                    cotes[cote.coteRueId].polyline.added = true;
                }
            }
        });
    };

    var polylineHandler = function (e) {
        if (e.targetType == "polyline") {
            selectedCote = e.target;
            //e.target.setOptions({ strokeThickness: 6, strokeColor: solidColors[e.target.cote.plan.etatDeneig] });
            if (e.target.cote.properties.DEBUT_ADRESSE && e.target.cote.properties.FIN_ADRESSE)
                $('.street-address').text(e.target.cote.properties.DEBUT_ADRESSE + "-" + e.target.cote.properties.FIN_ADRESSE + " " + e.target.cote.street.properties.DE);
            else
                $('.street-address').text(e.target.cote.street.properties.DE);

            if (e.target.cote.plan.etatDeneig == 0) {
                $('.street-detail').text('Enneigé');
            }
            else if (e.target.cote.plan.etatDeneig == 1) {
                $('.street-detail').text('Déneigé');
            }
            else if (e.target.cote.plan.etatDeneig == 2) {
                $('.street-detail').text('Planifié: ' + e.target.cote.plan.dateDebutPlanif + ' (début) - ' + e.target.cote.plan.dateFinPlanif + ' (fin)');
            }
            else if (e.target.cote.plan.etatDeneig == 3) {
                $('.street-detail').text('Replanifié: ' + e.target.cote.plan.dateDebutReplanif + ' (début) - ' + e.target.cote.plan.dateFinReplanif + '(fin)');
            }
            else if (e.target.cote.plan.etatDeneig == 4) {
                $('.street-detail').text('Planifié: ' + e.target.cote.plan.dateDebutPlanif + ' (début) - ' + e.target.cote.plan.dateFinPlanif + ' (fin)');
            } else {
                $('.street-detail').text('Pas disponible');
            }
            if (e.target.cote.plan.dateMaj) {
                $('.street-last').text('Mise à jour: ' + e.target.cote.plan.dateMaj);
            }
        }
    };

    $('#btn-gps').click(function () {
        navigator.geolocation.getCurrentPosition(onSuccess, onError);
        return false;
    });

    $('#btn-park-set').click(function () {

        var loc = myPushpin.getLocation();
        // check if we can park here:
        // find closest street
        var shortest = 1000000;
        var closestCote = null;
        for (var i in cotes) {
            if (cotes[i].polyline.getVisible()) {
                var distance = calDistance(cotes[i].polyline, loc.latitude, loc.longitude);
                if (distance < shortest) {
                    shortest = distance;
                    closestCote = cotes[i];
                }
            }
        }

        if (closestCote) {
            closestCote.polyline.setOptions({ strokeThickness: 12 });
            $.getJSON('http://infoneige.cloudapp.net/cotes/' + closestCote.coteRueId, function (data) {
                if (data.properties.DEBUT_ADRESSE && data.properties.FIN_ADRESSE)
                    $('.street-address').text(data.properties.DEBUT_ADRESSE + "-" + data.properties.FIN_ADRESSE + " " + data.street.properties.DE);
                else
                    $('.street-address').text(data.street.properties.DE);

                if (data.plan.etatDeneig == 0) {
                    $('.street-detail').text('Enneigé'); //snowy
                }
                else if (data.plan.etatDeneig == 1) {
                    $('.street-detail').text('Déneigé'); //plowed
                }
                else if (data.plan.etatDeneig == 2) { //planed
                    $('.street-detail').text('Attention: déneigement planifié: ' + data.plan.dateDebutPlanif + ' (début) - ' + data.plan.dateFinPlanif + ' (fin)');
                }
                else if (data.plan.etatDeneig == 3) {
                    $('.street-detail').text('Attention: déneigement replanifié: ' + data.plan.dateDebutReplanif + ' (début) - ' + data.plan.dateFinReplanif + '(fin)');
                }
                else if (data.plan.etatDeneig == 4) {
                    $('.street-detail').text('Attention: planifié: ' + data.plan.dateDebutPlanif + ' (début) - ' + data.plan.dateFinPlanif + ' (fin)');
                } else {
                    $('.street-detail').text('Pas disponible');
                }
                if (data.plan.dateMaj) {
                    $('.street-last').text('Mise à jour: ' + data.plan.dateMaj);
                }
            });
        }

        var center = new Microsoft.Maps.Location(loc.latitude, loc.longitude);
        map.setView({ center: center })
        $('#popupPark').popup('open');
        $('#popupPark').on("popupafterclose", function (event, ui) {
            if (closestCote) {
                closestCote.polyline.setOptions({ strokeThickness: 3 });
            }
        });
        return false;
    });

    $('#btn-park-continue').click(function () {
        var loc = myPushpin.getLocation();
        parked = true;
        localStorage.setItem('parked', JSON.stringify({ lat: loc.latitude, lon: loc.longitude }));
        parkedPushpin.setLocation(new Microsoft.Maps.Location(loc.latitude, loc.longitude));
        parkedPushpin.setOptions({ visible: true });
        myPushpin.setOptions({ visible: false });
        myPushpin.setLocation(new Microsoft.Maps.Location(curLat, curLon));
        afterParkedPushpin.setOptions({ visible: true });
        afterParkedPushpin.setLocation(new Microsoft.Maps.Location(curLat, curLon));

        $('#navbar-1').hide();
        $('#navbar-2').show();
        $('#btn-park-direction').show();
        $('#popupPark').popup('close');
        return false;
    });

    $('#btn-park-cancel').click(function () {
        $('#popupPark').popup('close');
        return false;
    });

    $('#btn-park-remove').click(function () {
        $('#popupFind').popup('close');
        localStorage.removeItem('parked');
        parkedPushpin.setOptions({ visible: false });
        parked = false;
        myPushpin.setOptions({ visible: true });
        afterParkedPushpin.setOptions({ visible: false });
        $('#navbar-1').show();
        $('#navbar-2').hide();
        $('#btn-park-direction').hide();
        return false;
    });

    $('#btn-park-find').click(function () {
        var loc = parkedPushpin.getLocation();
        gotoLocation(loc.latitude, loc.longitude);
        $('#popupFind').popup('open');

        return false;
    });
    $('#btn-park-direction').click(function () {
        $('#popupFind').popup('close');
        directionsManager.setRequestOptions({ routeMode: Microsoft.Maps.Directions.RouteMode.walking });
        var myloc = new Microsoft.Maps.Directions.Waypoint({ location: afterParkedPushpin.getLocation() });
        directionsManager.addWaypoint(myloc);
        var parkedloc = new Microsoft.Maps.Directions.Waypoint({ location: parkedPushpin.getLocation() });
        directionsManager.addWaypoint(parkedloc);
        directionsManager.setRenderOptions({ itineraryContainer: document.getElementById('directionsItinerary') });
        if (directionsErrorEventObj) {
            Microsoft.Maps.Events.removeHandler(directionsErrorEventObj);
            Microsoft.Maps.Events.removeHandler(directionsUpdateEventObj);
            directionsErrorEventObj = null;
            directionsUpdateEventObj = null;
        }
        directionsErrorEventObj = Microsoft.Maps.Events.addHandler(directionsManager, 'directionsError', function (arg) { alert('error'); });
        directionsUpdateEventObj = Microsoft.Maps.Events.addHandler(directionsManager, 'directionsUpdated', function () {
            $('.map').height(300);
            map.setOptions({ height: 300 });
            $('#btn-back').show();
            $('#btn-gps').hide();
            $('#btn-park-direction').hide();
            $('#navbar-2').hide();
        });

        directionsManager.calculateDirections();
        return false;
    });

    $('.btn-neige').click(function () {
        if (showSnow) {
            showSnow = false;
            $('.btn-neige').removeClass('ui-btn-active')
        } else {
            showSnow = true;
            $('.btn-neige').addClass('ui-btn-active')
        }
        snowLayer.setOptions({ visible: showSnow });
        localStorage.setItem("snowLayer", showSnow);
        return false;
    });

    $('#btn-back').click(function () {
        directionsManager.resetDirections();
        $('.map').height($(document).height() - 100);
        map.setOptions({ height: $(document).height() - 100 });
        $('#btn-back').hide();
        $('#btn-gps').show();
        $('#btn-park-direction').show();
        $('#navbar-2').show();
    });

    // onSuccess Callback
    // This method accepts a Position object, which contains the
    // current GPS coordinates
    //
    function onSuccess(position) {
        curLat = position.coords.latitude;
        curLon = position.coords.longitude;
        localStorage.setItem("lastKnownLocation", JSON.stringify({ lat: curLat, lon: curLon }));
        var center = new Microsoft.Maps.Location(curLat, curLon);
        myPushpin.setLocation(center);
        afterParkedPushpin.setLocation(center);

        if (loaded)
            gotoLocation(curLat, curLon);
    };

    function onError(error) {
        alert('Désolé, ne peut pas déterminer votre position actuelle.');
    }
    function onFirstTimeError() {
        var last = localStorage.getItem("lastKnownLocation");
        alert('Désolé, ne peut pas déterminer votre position actuelle.');
        if (last != null) {
            last = JSON.parse(last);
            curLat = last.lat;
            curLon = last.lon;
        } else {
            curLat = 45.5124433712;
            curLon = -73.5619527967;
        }

        var center = new Microsoft.Maps.Location(curLat, curLon);
        myPushpin.setLocation(center);
        afterParkedPushpin.setLocaiton(center);

        if (loaded)
            gotoLocation(curLat, curLon);
    }


    // calculate distance
    function calDistance(polyline, lat, lon) {
        var locs = polyline.getLocations();
        var lowest = 10000000;
        for (var i = 0; i < locs.length - 1; i++) {
            d = pDistance(lat, lon , locs[i].latitude, locs[i].longitude, locs[i + 1].latitude, locs[i+1].longitude);
            if (d < lowest)
                lowest = d;
        }
        return lowest;
    }
    function pDistance(x, y, x1, y1, x2, y2) {

        var A = x - x1;
        var B = y - y1;
        var C = x2 - x1;
        var D = y2 - y1;

        var dot = A * C + B * D;
        var len_sq = C * C + D * D;
        var param = dot / len_sq;

        var xx, yy;

        if (param < 0 || (x1 == x2 && y1 == y2)) {
            xx = x1;
            yy = y1;
        }
        else if (param > 1) {
            xx = x2;
            yy = y2;
        }
        else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }

        var dx = x - xx;
        var dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
});

