/////////////////////////////////////////////////////////////////////
// Viewing.Extension.VisualReport.Panel
// by Philippe Leefsma, April 2016
//
/////////////////////////////////////////////////////////////////////
import CircleGraph from './CircleGraph/CircleGraph'
import ForceGraph from './ForceGraph/ForceGraph'
import './Viewing.Extension.VisualReport.css'
import PieChart from './PieChart/PieChart'
import BarChart from './BarChart/BarChart'
import ViewerToolkit from 'ViewerToolkit'
import ToolPanelBase from 'ToolPanelBase'
import TabManager from 'TabManager'
import Dropdown from 'Dropdown'
import d3 from 'd3'

export default class VisualReportPanel extends ToolPanelBase{

  constructor(viewer, properties, componentIds) {

    super(viewer.container, 'Visual Reports', {
      shadow: true
    });

    this.viewer = viewer;

    this.componentIds = componentIds;

    $(this.container).addClass('visual-report');

    //Properties dropdown

    var menuItems = properties.map((prop)=>{

      var value = prop.replace(':', '');

      return {
        name: value,
        value: value
      }
    });

    this.dropdown = new Dropdown({
      container: '#' + this.propsContainerId,
      title: 'Property',
      prompt: 'Select a property ...',
      pos: {
        top: 0, left: 0
      },
      menuItems
    });

    this.onPropertyChangedHandler =
      (e) => this.onPropertyChanged(e);

    this.dropdown.on('item.selected', (item)=>{

      this.onPropertyChangedHandler(item.value);
    });

    //Tab Control

    this.TabManager = new TabManager(
      '#' + this.tabsContainerId);

    this.onTabVisibleHandler =
      (e) => this.onTabVisible(e);

    this.TabManager.on('tab.visible', (tabInfo)=>{

      this.onTabVisibleHandler(tabInfo);
    });

    this.pieChartSelector = ToolPanelBase.guid();

    this.pieTabId = this.TabManager.addTab({
      name: 'Pie Chart',
      active: true,
      html: `<p class="d3 d3-pie c${this.pieChartSelector}"></p>`
    });

    this.barChartSelector = ToolPanelBase.guid();

    this.barTabId = this.TabManager.addTab({
      name: 'Bar Chart',
      html: `<p class="d3 d3-bar c${this.barChartSelector}"></p>`
    });

    this.forceGraphSelector = ToolPanelBase.guid();

    this.forceTabId = this.TabManager.addTab({
      name: 'Force Graph',
      html: `<p class="d3 d3-force c${this.forceGraphSelector}"></p>`
    });

    this.circleGraphSelector = ToolPanelBase.guid();

    this.circleTabId = this.TabManager.addTab({
      name: 'Circle Graph',
      html: `<p class="d3 d3-circle c${this.circleGraphSelector}"></p>`
    });
  }

  /////////////////////////////////////////////////////////////
  //
  //
  /////////////////////////////////////////////////////////////
  htmlContent(id) {

    this.propsContainerId = ToolPanelBase.guid();
    this.tabsContainerId = ToolPanelBase.guid();

    return `
      <div class="container">

        <div id="${this.propsContainerId}" class="props-container">
        </div>

        <div id="${this.tabsContainerId}" class="tabs-container">
        </div>
      </div>`;
  }

  /////////////////////////////////////////////////////////////
  //
  //
  /////////////////////////////////////////////////////////////
  onTabVisible(tabInfo) {

  }

  /////////////////////////////////////////////////////////////
  //
  //
  /////////////////////////////////////////////////////////////
  createMaterial(clrStr) {

    var clr = parseInt(clrStr.replace('#',''), 16);

    var props = {
      shading: THREE.FlatShading,
      name: ViewerToolkit.guid(),
      shininess: 10,
      specular: clr,
      color: clr
    };

    var material = new THREE.MeshPhongMaterial(props);

    this.viewer.impl.matman().addMaterial(
      props.name,
      material,
      true);

    return material;
  }

  /////////////////////////////////////////////////////////////////
  // Dropdown selected item changed
  //
  /////////////////////////////////////////////////////////////////
  async onPropertyChanged(propName){

    var componentsMap = await ViewerToolkit.mapComponentsByProp(
      this.viewer.model,
      propName,
      this.componentIds);

    var groupedMap = this.groupMap(
      componentsMap, 'Other', 1.5);

    var keys = Object.keys(groupedMap);

    var colors = d3.scale.linear()
      .domain([0, keys.length * .33, keys.length * .66, keys.length])
      .range(['#B58929','#C61C6F', '#268BD2', '#85992C']) //Orange to Green.

    var data = keys.map((key, idx)=> {

      var color = colors(idx);

      var material = this.createMaterial(color);

      var dbIds = groupedMap[key];

      dbIds.forEach((dbId)=> {

        ViewerToolkit.setMaterial(
          this.viewer.model,
          dbId,
          material);
      });

      return {
        label: key,
        dbIds: dbIds,
        color: color,
        value: dbIds.length
      }
    });

    $('.d3 > svg').remove();

    this.viewer.fitToView();
    this.viewer.isolate();

    this.pieChart = new PieChart(
      '.c' + this.pieChartSelector,
      data);

    this.pieChart.on('segment.click', (e)=>{

      this.viewer.fitToView(e.dbIds);
      this.viewer.isolate(e.dbIds);
    });

    this.barChart = new BarChart(
      '.c' + this.barChartSelector,
      data);

    this.barChart.on('bar.click', (e)=>{

      this.viewer.fitToView(e.dbIds);
      this.viewer.isolate(e.dbIds);
    });

    var dataTree = await this.buildCustomDataTree(
      propName);

    this.forceGraph = new ForceGraph(
      '.c' + this.forceGraphSelector,
      dataTree);

    this.forceGraph.on('node.click', (e)=>{

      this.viewer.fitToView(e.dbId);
      this.viewer.isolate(e.dbId);
    });

    this.circleGraph = new CircleGraph(
      '.c' + this.circleGraphSelector,
      dataTree);

    this.viewer.impl.invalidate(
      true, false, false);
  }

  /////////////////////////////////////////////////////////////
  // Group object map for small values:
  // If one entry of the map is smaller than minPercent, this
  // entry will be merged in the "groupName" entry
  //
  /////////////////////////////////////////////////////////////
  groupMap(map, groupName, minPercent){

    var stats = _.transform(map,  function(result, value) {

      result['total'] =  (result['total'] || 0) + value.length;
    });

    return _.transform(map,

      function(result, value, key) {

        if(value.length * 100 / stats['total'] < minPercent){

          result[groupName] = (result[groupName] || []).concat(
            value);
        }
        else{

          result[key] = value;
        }
      });
  }

  /////////////////////////////////////////////////////////////
  // Builds a custom data tree formatted for the force graph
  // based on viewer input property
  //
  /////////////////////////////////////////////////////////////
  async buildCustomDataTree(propName) {

    var model = this.viewer.model;

    var root = await ViewerToolkit.buildModelTree(
      model);

    var taskFunc = (node, parent)=> {

      return new Promise(async(resolve, reject)=> {

        try {

          node.parent = parent;

          var prop = await ViewerToolkit.getProperty(
            model, node.dbId, propName);

          if (isNaN(prop.displayValue)) {

            node.size = 0;
          }
          else {

            node.size = prop.displayValue;
          }

          return resolve();
        }
        catch (ex) {

          node.size = 0;
          return resolve();
        }
      });
    }

    await ViewerToolkit.runTaskOnDataTree(
      root, taskFunc);

    this.normalize(root);

    return root;
  }

  /////////////////////////////////////////////////////////////
  // Normalize data tree: sets size between [0, 1]
  // based on computed max over all nodes
  //
  /////////////////////////////////////////////////////////////
  normalize(dataTree) {

    var min = Number.MAX_VALUE;
    var max = Number.MIN_VALUE;

    function computeMinMaxRec(node){

      min = Math.min(min, node.size);
      max = Math.max(max, node.size);

      if(node.children){

        node.children.forEach((child)=>{

          computeMinMaxRec(child);
        });
      }
    }

    if(max === 0){
      return;
    }

    computeMinMaxRec(dataTree);

    function normalizeRec(node){

      node.size /= max;

      if(node.children){

        node.children.forEach((child)=>{

          normalizeRec(child);
        });
      }
    }
  }
}