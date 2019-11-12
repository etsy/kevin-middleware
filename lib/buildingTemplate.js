/**
 * When we start a new compiler for an asset, it probably won't be served inside of the
 * second timeout window. We can kick this file back instead, and use it to mitigate the
 * initial loading time. Note that it re-renders the page each time it's called with the
 * most up-to-date list of currently-being-built assets.
 */
module.exports = (assetName, configName, kevinStatusUrl, additionalInfo) => {
    return `
/**
 * Hi! If you're seeing this, it means Kevin just started a compiler to build this
 * asset. The request for this asset would likely have timed out before compilation would
 * have finished, so you're seeing this instead. Just hang on a sec and reload the page.
 *
 * The code below renders an overlay and says as much. It'll reload your browser once
 * Kevin is done building everything.
 */

(function() {

var loadingBars = [
    // Don't use spaces; leading spaces get swallowed.
    // Make sure your patterns are at least as long as this line:  |
    //                                                             |
    "/.../.../.../.../.../.../.../.../.../.../.../.../.../.../.../.../...",
    '_.~"~._.~"~._.~"~._.~"~._.~"~._.~"~._.~"~._.~"~._.~"~._.~"~._.~"~.',
    '_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(_.~"(',
    '☃........☃........☃........☃........☃........☃........☃........',
    '▂▄▆██▇▅▃▁▁▁▂▄▆██▇▅▃▁▁▁▂▄▆██▇▅▃▁▁▁▂▄▆██▇▅▃▁▁▁▂▄▆██▇▅▃▁▁▁▂▄▆██▇▅▃▁▁▁',
];

// Returns true if we're in an iframe.
function isIframe () {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true;
    }
}

// equivalent to jQuery's $(document).ready()
function ready(fn) {
    if (document.attachEvent ? document.readyState === "complete" : document.readyState !== "loading"){
        fn();
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

// Initialize and add to the window's manifest of assets in flight.
window.__KEVIN_IS_STILL_BUILDING = window.__KEVIN_IS_STILL_BUILDING || {};
window.__KEVIN_IS_STILL_BUILDING["${configName}"] = window.__KEVIN_IS_STILL_BUILDING["${configName}"] || [];
window.__KEVIN_IS_STILL_BUILDING["${configName}"].push("${assetName}");

// We'll update the overlay with the compilers currently building
function getHTMLForBuildingCompilers() {
    return Object.keys(window.__KEVIN_IS_STILL_BUILDING).map(function(configName) {
        var assets = window.__KEVIN_IS_STILL_BUILDING[configName];
        return "<strong>" + configName + "</strong><ul>" + assets.map(function(asset) {
            return "<li>" + asset + "</li>";
        }).join("") + "</ul>";
    }).join("")
}

    ${
        kevinStatusUrl
            ? `
// Keep checking until the build is complete. Don't start a listener in an iframe because
// there may be a listener in the parent window as well.
if (!isIframe() && !window.__KEVIN_CHECKS_ON_BUILDS) {

    // This animates the loading bar
    setInterval(function() {
        var loadingBar = document.getElementById("kevin-loading-bar");
        if (loadingBar) {
            var text = loadingBar.innerHTML;
            loadingBar.innerHTML = text.slice(-1) + text.slice(0, -1);
        }
    }, 100);

    // This gets attached to the XHR in the setInterval below
    var loadListener = function() {
        var data = JSON.parse(this.response);
        console.log("Kevin middleware compilation status:", data);

        var aConfigHasFinished = false;
        Object.keys(window.__KEVIN_IS_STILL_BUILDING).forEach(function(config) {
            if (data[config] === "done") {
                delete window.__KEVIN_IS_STILL_BUILDING[config];
                aConfigHasFinished = true;
            }
        });

        if (aConfigHasFinished) {
            var buildingList = document.getElementById("kevin-overlay-building-list");
            if (buildingList) {
                if (Object.keys(window.__KEVIN_IS_STILL_BUILDING).length > 0) {
                    buildingList.innerHTML = getHTMLForBuildingCompilers();
                } else {
                    buildingList.innerHTML = "<strong>All done. Reloading the page.</strong>";
                }
            }
        }

        var doneBuilding = Object.keys(data)
            .filter(function(config) {
                return window.__KEVIN_IS_STILL_BUILDING.hasOwnProperty(config);
            })
            .every(function(config) {
                return data[config] !== "first-build";
            });
        if (doneBuilding) {
            clearInterval(window.__KEVIN_CHECKS_ON_BUILDS);
            window.location.reload(true);
        }

    }
    // This checks in with Kevin to see if the builds are all done
	window.__KEVIN_CHECKS_ON_BUILDS = setInterval(function() {
        var xhr = new XMLHttpRequest();
        xhr.addEventListener("load", loadListener);
        xhr.open("GET", "${kevinStatusUrl}");
        xhr.send();
	}, 1000);
} `
            : ""
    }

// A horrible, horrible, horrible inline style tag's contents.
var styleContents = "#kevin-still-building-overlay, #kevin-still-building-overlay ul, #kevin-still-building-overlay li, #kevin-still-building-overlay div, #kevin-still-building-overlay pre, #kevin-still-building-overlay strong, #kevin-still-building-overlay h3 {" +
        "font-size: 14px; line-height: 20px; margin: 0; padding: 0; color: #222; background-color: unset; text-align: left;" +
        "font-family: -apple-system, BlinkMacSystemFont, 'avenir next', avenir, 'helvetica neue', helvetica, ubuntu, roboto, noto, 'segoe ui', arial, sans-serif;" +
    "}" +
    "#kevin-still-building-overlay { position: fixed; left: 0; right: 0; top: 0; margin: 50px auto 30px; max-width: 600px; background-color: #d2dae3; border: 5px solid #1e272e; box-shadow: #1e272e 15px 15px; z-index: 99999; padding: 48px 24px 24px; }" +
    "#kevin-still-building-overlay h3 { margin-bottom: 24px; font-size: 2em; font-weight: bold; }" +
    "#kevin-still-building-overlay strong { font-weight: bold; }" +
    "#kevin-still-building-overlay ul { padding-left: 18px; }" +
    "#kevin-still-building-overlay button { position: absolute; top: 10px; right: 10px; }" +
    "#kevin-still-building-overlay pre, #kevin-still-building-overlay code { font-family: Courier New,Courier,Lucida Sans Typewriter,Lucida Typewriter,monospace; }" +
    "#kevin-still-building-overlay #kevin-loading-bar { overflow:hidden; white-space:nowrap; background-color: #FBFBFA; border-radius:2px; padding: 12px 0; }";

// Show the overlay
ready(function() {
    if (document.getElementById("kevin-still-building-overlay") === null) {
        var node = document.createElement("div");
        node.setAttribute("id", "kevin-still-building-overlay");

        document.body.appendChild(node);
    }

    var node = document.getElementById("kevin-still-building-overlay");
    node.innerHTML = "<style>" + styleContents + "</style><div>" +
            "<h3>Your code is out for delivery</h3>" +
            "We've just started compiling the assets for this page for the first time. " +
            "<strong>${
                kevinStatusUrl
                    ? "This page will reload automatically when we're ready for you."
                    : "Wait a few seconds for it to finish, and then refresh the page."
            }</strong> "+
            "Subsequent rebuilds will be much faster, and will prevent your javascript from " +
            "loading until the build is complete." +
            "${additionalInfo ? "<br /><br />" + additionalInfo : ""}" +

            "<br/><br/>" +
            "<button onclick='document.getElementById(\\"kevin-still-building-overlay\\").remove()'>" +
                "✕" +
            "</button>" +
    "${
        kevinStatusUrl
            ? `<pre id='kevin-loading-bar'>" +
                loadingBars[Math.floor(Math.random() * loadingBars.length)] +
                "   JUST A MOMENT   " + // <-- these are non-breaking spaces!
            "</pre><br/><br/>`
            : ""
    }" +
            "These are the compilers that are still building:<br/><br/>" +
            "<div id='kevin-overlay-building-list'>" +
            getHTMLForBuildingCompilers() +
            "</div>"
            "<br/>" +
        "</div>";
 });

 })();
`;
};
