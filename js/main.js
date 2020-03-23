//this reads all the data layers, and displaying features
//begin script when window loads
//First line of main.js...wrap everything in a self-executing anonymous function to move to local scope
(function(){
//global variables
var attrArray = ["Youth Population", "Area", "Elementary Schools", "Middle Schools", "High Schools"]; //list of attributes
var expressed = attrArray[0]; //initial attribute


//chart frame dimensions
    var chartWidth = window.innerWidth * 0.425,
        chartHeight = 473,
        leftPadding = 25,
        rightPadding = 2,
        topBottomPadding = 5,
        chartInnerWidth = chartWidth - leftPadding - rightPadding,
        chartInnerHeight = chartHeight - topBottomPadding * 2,
        translate = "translate(" + leftPadding + "," + topBottomPadding + ")";

//create a scale to size bars proportionally to frame and for axis
    var yScale = d3.scaleLinear()
        .range([chartHeight - 10, 0])
        .domain([0, 88*1.1]); // csv first column max = 88
var currentLocation; 

window.onload = setMap();

    //set up choropleth map
    function setMap(){

        //map frame dimensions
        var width = window.innerWidth * 0.5, //960,
            height = 460;

        //create new svg container for the map
        var map = d3.select("body")
            .append("svg")
            .attr("class", "map")
            .attr("width", width)
            .attr("height", height);

        //create The equirectangular (plate carrée) projection. centered on virginia
        var projection = d3.geoEquirectangular()
            .center([18.18, 29.96])
            .rotate([98.18, -7.70, -2])
            //.parallels([0, 25])
            .scale(6500.85)
            .translate([width / 2, height / 2]);

        var path = d3.geoPath()
            .projection(projection);


        var promises = [];
        promises.push(d3.csv("data/valab.csv")); //load attributes from csv
        promises.push(d3.json("data/UsState.topojson")); //load background spatial data
        promises.push(d3.json("data/AllVaCounty.topojson")); //load choropleth spatial data
        Promise.all(promises).then(callback);

        function callback(data){
            //[csvData, state, county] = data;
            csvData = data[0];
            state = data[1];
            county = data[2];

            console.log(csvData);
            console.log(state);
            console.log(county);

            //translate europe TopoJSON
            var usState = topojson.feature(state, state.objects.UsState),
                allVaCounty = topojson.feature(county, county.objects.AllVaCounty).features;



            //add outline to map
            var stateLine = map.append("path")
                .datum(usState)
                .attr("class", "stateLine")
                .attr("d", path);

            //join csv data to GeoJSON enumeration units
            allVaCounty = joinData(allVaCounty, csvData);

            //create the color scale
            var colorScale = makeColorScale(csvData);

            //add enumeration units to the map
            setEnumerationUnits(allVaCounty, map, path, colorScale);

            //add coordinated visualization to the map
            setChart(csvData, colorScale);

            // dropdown
            createDropdown(csvData);

        };
    }; //end of setMap()

    function joinData(allVaCounty, csvData){
        //...DATA JOIN LOOPS
        //loop through csv to assign each set of csv attribute values to geojson region
        for (var i=0; i<csvData.length; i++){
            var csvRegion = csvData[i]; //the current region
            var csvKey = csvRegion.STCOFIPS; //the CSV primary key

            //loop through geojson regions to find correct region
            for (var a=0; a<allVaCounty.length; a++){

                var geojsonProps = allVaCounty[a].properties; //the current region geojson properties
                var geojsonKey = geojsonProps.STCOFIPS; //the geojson primary key

                //where primary keys match, transfer csv data to geojson properties object
                if (geojsonKey == csvKey){

                    //assign all attributes and values
                    attrArray.forEach(function(attr){
                        var val = parseFloat(csvRegion[attr]); //get csv attribute value
                        geojsonProps[attr] = val; //assign attribute and value to geojson properties
                    });
                };
            };
        };


        return allVaCounty;
    };

//Natural Breaks color scale
    function makeColorScale(data){
        var colorClasses = [
            "#9ecae1",
            "#6baed6",
            "#4292c6",
            "#2171b5",
            "#084594"
        ];

        //create color scale generator
        var colorScale = d3.scaleThreshold()
            .range(colorClasses);

        //build array of all values of the expressed attribute
        var domainArray = [];
        for (var i=0; i<data.length; i++){
            var val = parseFloat(data[i][expressed]);
            domainArray.push(val);
        };

        //cluster data using ckmeans clustering algorithm to create natural breaks
        var clusters = ss.ckmeans(domainArray, 5);
        //reset domain array to cluster minimums
        domainArray = clusters.map(function(d){
            return d3.min(d);
        });
        //remove first value from domain array to create class breakpoints
        //console.log(domainArray);
        domainArray.shift();

        //assign array of last 4 cluster minimums as domain
        colorScale.domain(domainArray);
        //console.log(domainArray);

        return colorScale;
    };


//function to test for data value and return color
    function choropleth(props, colorScale){
        //make sure attribute value is a number
        var val = parseFloat(props[expressed]);
        //if attribute value exists, assign a color; otherwise assign gray
        if (typeof val == 'number' && !isNaN(val)){
            return colorScale(val);
        } else {
            return "#CCC";
        };
    };


    function setEnumerationUnits(allVaCounty, map, path, colorScale){

        //add counties to map
        var countyLine = map.selectAll(".county")
            .data(allVaCounty)
            .enter()
            .append("path")
            .attr("class", function(d){
                return "county " + "_" + d.properties.STCOFIPS;
            })
            .attr("d", path)
            .style("fill", function(d){
                return choropleth(d.properties, colorScale);
            })
            .on("mouseover", function(d){
                currentLocation = d; 
                highlight(d.properties);
            })
            .on("mouseout", function(d){
                dehighlight(d.properties);
            })
            .on("mousemove", moveLabel);

        //below Example 2.2 line 16...add style descriptor to each path
        var desc = countyLine.append("desc")
            .text('{"stroke": "#000", "stroke-width": "0.5px"}');
    };

//function to create coordinated bar chart
    function setChart(csvData, colorScale){

        //create a second svg element to hold the bar chart
        var chart = d3.select("body")
            .append("svg")
            .attr("width", chartWidth)
            .attr("height", chartHeight)
            .attr("class", "chart");

        //create a rectangle for chart background fill
        var chartBackground = chart.append("rect")
            .attr("class", "chartBackground")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);


        //set bars for each province
        var bars = chart.selectAll(".bar")
            .data(csvData)
            .enter()
            .append("rect")
            .sort(function(a, b){
                return b[expressed]-a[expressed]
            })
            .attr("class", function(d){
                return "bar " + "_" + d.STCOFIPS;
            })
            .attr("width", chartInnerWidth / csvData.length - 1)
            .on("mouseover", highlight)
            .on("mouseout", dehighlight)
            .on("mousemove", moveLabel);

        //below Example 2.2 line 31...add style descriptor to each rect
        var desc = bars.append("desc")
            .text('{"stroke": "none", "stroke-width": "0px"}');

        //create a text element for the chart title
        var chartTitle = chart.append("text")
            .attr("x", 130)
            .attr("y", 40)
            .attr("class", "chartTitle")
            .text("Number of Variable " + expressed + " in each County");

        //create vertical axis generator
        var yAxis = d3.axisLeft()
            .scale(yScale);

        //place axis
        var axis = chart.append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);

        //create frame for chart border
        var chartFrame = chart.append("rect")
            .attr("class", "chartFrame")
            .attr("width", chartInnerWidth)
            .attr("height", chartInnerHeight)
            .attr("transform", translate);

        //set bar positions, heights, and colors
        updateChart(bars, csvData.length, colorScale);
    };

    //function to create a dropdown menu for attribute selection
    function createDropdown(csvData){
        //add select element
        var dropdown = d3.select("body")
            .append("select")
            .attr("class", "dropdown")
             .on("change", function(){
                changeAttribute(this.value, csvData, -1)
            });
         changeAttribute(expressed, csvData, 0); 
        //add initial option
        var titleOption = dropdown.append("option")
            .attr("class", "titleOption")
            .attr("disabled", "true")
            .text("Select Attribute");

        //add attribute name options
        var attrOptions = dropdown.selectAll("attrOptions")
            .data(attrArray)
            .enter()
            .append("option")
            .attr("value", function(d){ return d })
            .text(function(d){ return d });
    };

//dropdown change listener handler
    function changeAttribute(attribute, csvData, dur){
        //change the expressed attribute
        expressed = attribute;


        // change yscale dynamically
        csvmax = d3.max(csvData, function(d) { return parseFloat(d[expressed]); });

        yScale = d3.scaleLinear()
            .range([chartHeight - 10, 0])
            .domain([0, csvmax*1.1]);

        //updata vertical axis
        d3.select(".axis").remove();
        var yAxis = d3.axisLeft()
            .scale(yScale);

        //place axis
        var axis = d3.select(".chart")
            .append("g")
            .attr("class", "axis")
            .attr("transform", translate)
            .call(yAxis);


        //recreate the color scale
        var colorScale = makeColorScale(csvData);

        //recolor enumeration units
        var countyLine = d3.selectAll(".county")
            .transition()
            .duration(dur == -1 ? 500: 0)
            .style("fill", function(d){
                return choropleth(d.properties, colorScale)
            });

        //re-sort, resize, and recolor bars
        var bars = d3.selectAll(".bar")
            //re-sort bars
            .sort(function(a, b){
                return b[expressed] - a[expressed];
            })
            .transition() //add animation
            .delay(function(d, i){
                return i * 20
            })
            .duration(dur == -1 ? 500: 0);

        updateChart(bars, csvData.length, colorScale);
    };

//function to position, size, and color bars in chart
    function updateChart(bars, n, colorScale){
        //position bars
        bars.attr("x", function(d, i){
            return i * (chartInnerWidth / n) + leftPadding;
        })
            //size/resize bars
            .attr("height", function(d, i){
                return 463 - yScale(parseFloat(d[expressed]));
            })
            .attr("y", function(d, i){
                return yScale(parseFloat(d[expressed])) + topBottomPadding;
            })
            //color/recolor bars
            .style("fill", function(d){
                return choropleth(d, colorScale);
            });

        //add text to chart title
        var chartTitle = d3.select(".chartTitle")
            .text("Number of Variable " + expressed + " in each County");
    };

//function to highlight enumeration units and bars
    function highlight(props){
        
        //change stroke
        var selected = d3.selectAll("." + "_" + props.STCOFIPS)
            .style("stroke", "red")
            .style("stroke-width", "3");

        setLabel(props);
    };

//function to reset the element style on mouseout
    function dehighlight(props){
        var selected = d3.selectAll("." + "_" + props.STCOFIPS)
            .style("stroke", null/*function(){
                return getStyle(this, "stroke")
            }*/)
            .style("stroke-width", function(){
                return getStyle(this, "stroke-width")
            });

        //remove info label
        d3.select(".infolabel")
            .remove();

        function getStyle(element, styleName){
            var styleText = d3.select(element)
                .select("desc")
                .text();

            var styleObject = JSON.parse(styleText);

            return styleObject[styleName];
        };
    };

//function to create dynamic label

    function setLabel(props){
        //label content
        // var labelStr = props.
        var labelAttribute = `<h1>${props[expressed]}</h1><b>${expressed}</b>`;
    
        //create info label div
        var infolabel = d3.select("body")
            .append("div")
            .attr("class", "infolabel")
            .attr("id", props.STCOFIPS + "_label")
            .html(labelAttribute);

        var countyName = infolabel.append("div")
            .attr("class", "labelname")
            .html(props.Location ? props.Location : getCounty(currentLocation.properties)); //is this reading the csv file, the s
    };

//function to move info label with mouse
//Example 2.8 line 1...function to move info label with mouse
    //function to add county name to the info pop up label
    function getCounty(countyInfo){
        var fips = countyInfo.STCOFIPS; 
        for (var i= 0; i < csvData.length;i++)
        {
        var item = csvData[i]; 
        if (item.STCOFIPS == fips) {
            return item.Location; 
        }
        }
        return "N/A"; 
    }
    function moveLabel(){
        //get width of label
        var labelWidth = d3.select(".infolabel")
            .node()
            .getBoundingClientRect()
            .width;

        //use coordinates of mousemove event to set label coordinates
        var x1 = d3.event.clientX + 10,
            y1 = d3.event.clientY - 75,
            x2 = d3.event.clientX - labelWidth - 10,
            y2 = d3.event.clientY + 25;

        //horizontal label coordinate, testing for overflow
        var x = d3.event.clientX > window.innerWidth - labelWidth - 20 ? x2 : x1;
        //vertical label coordinate, testing for overflow
        var y = d3.event.clientY < 75 ? y2 : y1;

        d3.select(".infolabel")
            .style("left", x + "px")
            .style("top", y + "px");
    };

})(); //last line of main.js