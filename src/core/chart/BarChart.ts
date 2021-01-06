import { Ani } from "../ani/Ani";
import { Component } from "../component/Component";
import { Image } from "../component/Image";
import { Rect } from "../component/Rect";
import { Text } from "../component/Text";
import { recourse } from "../Recourse";
import * as d3 from "d3";
import * as _ from "lodash-es";
import { colorPicker } from "../ColorPicker";
import { canvasHelper } from "../CanvasHelper";
import { Stage } from "../Stage";
interface BarOptions {
  id: string;
  value: number;
  pos: { x: number; y: number };
  shape: { width: number; height: number };
  color: string;
  radius: number;
  alpha: number;
  image?: string;
}

interface BarChartOptions {
  aniTime?: [number, number];
  freezeTime?: [number, number];
  itemCount?: number;
  idField?: string;
  fadeTime?: [number, number];
  colorField?: string;
  dateField?: string;
  valueField?: string;
  valueKeys?: string[];
  shape?: { width: number; height: number };
  margin?: { left: number; top: number; bottom: number; right: number };
  barPadding?: number;
  barGap?: number;
  valueFormat?: (val: number) => string;
  labelFormat?: (id: string, meta?: Map<string, any>) => string;
  barInfoFormat?: (id: string, meta?: Map<string, any>) => string;
  dateFormat?: string;
}
export class BarChart extends Ani {
  data: any[];
  meta: Map<string, any>;
  dataScales: Map<string, any>;
  aniTime: [number, number];
  freezeTime = [2, 2];
  itemCount = 20;
  idField = "id";
  colorField = "id";
  dateField = "date";
  valueField = "value";
  fadeTime = [0.5, 0];
  valueKeys = ["value"];
  shape = { width: 400, height: 300 };
  margin = { left: 20, top: 20, right: 20, bottom: 20 };
  barPadding = 8;
  barGap = 8;
  swap = 0.25;
  lastValue = new Map<string, number>();
  dateFormat = "%Y-%m-%d";
  private secToDate: d3.ScaleLinear<any, any, never>;
  labelPlaceholder: number;
  valuePlaceholder: number;
  alphaScale: d3.ScaleLinear<number, number, never>;

  get sampling() {
    if (this.stage) {
      return Math.round(this.stage.options.fps * this.swap);
    } else {
      return Math.round(30 * this.swap);
    }
  }

  valueFormat = (val: number) => {
    return d3.format(",.0f")(val);
  };

  barInfoFormat = (id: any, meta?: Map<string, any>) => {
    return this.labelFormat(id, meta);
  };

  labelFormat = (id: string, meta?: Map<string, any>) => {
    if (meta.get(id) && meta.get(id).name) {
      return meta.get(id).name;
    } else {
      return id;
    }
  };

  historyIndex: Map<any, any>;
  ids: string[];
  constructor(options?: BarChartOptions) {
    super();
    if (!options) return;
    if (options.fadeTime) this.fadeTime = options.fadeTime;
    if (options.aniTime) this.aniTime = options.aniTime;
    if (options.freezeTime) this.freezeTime = options.freezeTime;
    if (options.shape) this.shape = options.shape;
    if (options.idField) this.idField = options.idField;
    if (options.dateField) this.dateField = options.dateField;
    if (options.valueField) this.valueField = options.valueField;
    if (options.itemCount) this.itemCount = options.itemCount;
    if (options.barPadding !== undefined) this.barPadding = options.barPadding;
    if (options.margin !== undefined) this.margin = options.margin;
    if (options.barGap !== undefined) this.barGap = options.barGap;
    if (options.dateFormat) this.dateFormat = options.dateFormat;
    if (options.valueFormat) this.valueFormat = options.valueFormat;
    if (options.labelFormat) this.labelFormat = options.labelFormat;
  }
  setup(stage: Stage) {
    super.setup(stage);
    if (this.aniTime === undefined) {
      this.aniTime = [
        0 + this.fadeTime[0] + this.freezeTime[0],
        stage.options.sec - this.freezeTime[1] - this.fadeTime[1],
      ];
    }
    this.setData();
    this.setMeta();
    this.setDataScales();
    this.ids = [...this.dataScales.keys()];
    this.labelPlaceholder = this.maxLabelWidth;
    this.valuePlaceholder = this.maxValueLabelWidth;
    const range = d3.range(
      this.aniTime[0] - this.swap,
      this.aniTime[0],
      this.swap / this.sampling
    );
    const datas = range.map((t) =>
      this.getCurrentData(t).map((v) => v[this.idField])
    );
    this.historyIndex = this.ids.reduce((d, id) => {
      const indexList = [];
      for (const dataList of datas) {
        let index = dataList.indexOf(id);
        if (index === -1) index = this.itemCount;
        indexList.push(index);
      }
      d.set(id, indexList);
      return d;
    }, new Map());
    this.alphaScale = d3
      .scaleLinear(
        [
          this.aniTime[0] - this.freezeTime[0] - this.fadeTime[0],
          this.aniTime[0] - this.freezeTime[0],
          this.aniTime[1] + this.freezeTime[1],
          this.aniTime[1] + this.freezeTime[1] + this.fadeTime[1],
        ],
        [this.fadeTime[0] ? 0 : 1, 1, 1, this.fadeTime[1] ? 0 : 1]
      )
      .clamp(true);
  }
  setMeta() {
    this.meta = d3.rollup(
      _.cloneDeep(recourse.data.get("meta")),
      (v) => v[0],
      (d) => d[this.idField]
    );
  }

  private get maxValueLabelWidth() {
    const d = [...this.data.values()];
    const maxWidth = d3.max(d, (item) => {
      const text = new Text(
        this.getLabelTextOptions(
          this.valueFormat(item.value),
          "#FFF",
          this.barHeight * 0.8
        )
      );
      const result = canvasHelper.measure(text);
      return result.width;
    });
    return maxWidth;
  }
  private get maxLabelWidth() {
    const maxWidth = d3.max(this.ids, (id) => {
      const text = new Text(
        this.getLabelTextOptions(
          this.labelFormat(id, this.meta),
          "#FFF",
          this.barHeight * 0.8
        )
      );
      const result = canvasHelper.measure(text);
      return result.width;
    });
    return maxWidth;
  }

  getComponent(sec: number) {
    const currentData = this.getCurrentData(sec);
    currentData.forEach((d, i) => {
      const index = Number.isNaN(d[this.valueField]) ? this.itemCount : i;
      this.historyIndex.get(d[this.idField]).push(index);
    });
    for (const history of this.historyIndex.values()) {
      const len = history.length;
      if (len === this.sampling) {
        history.push(this.itemCount);
      }
      history.shift();
    }
    const indexs = this.ids.reduce(
      (map, id) =>
        map.set(
          id,
          d3.mean(this.historyIndex.get(id).map((data: unknown) => data))
        ),
      new Map()
    );
    const [min, max] = d3.extent(currentData, (d) => d[this.valueField]);
    const scaleX = d3.scaleLinear(
      [0, max],
      [
        0,
        this.shape.width -
          this.margin.left -
          this.barPadding -
          this.labelPlaceholder -
          this.margin.right -
          this.valuePlaceholder,
      ]
    );

    const res = new Component({ alpha: this.alphaScale(sec) });
    currentData.forEach((data) => {
      const barOptions = this.getBarOptions(data, scaleX, indexs, sec);
      if (barOptions.alpha > 0) {
        res.children.push(this.getBarComponent(barOptions));
      }
    });

    const dateLabel = new Text({
      text: d3.timeFormat(this.dateFormat)(this.secToDate(sec)),
      font: "Sarasa Mono Slab SC",
      fontSize: 45,
      fillStyle: "#777",
      textAlign: "right",
      fontWeight: "bolder",
      textBaseline: "bottom",
      position: {
        x: this.shape.width - this.margin.right,
        y: this.shape.height - this.margin.bottom,
      },
    });
    res.children.push(dateLabel);
    return res;
  }
  private get barHeight() {
    return (
      (this.shape.height -
        this.margin.top -
        this.margin.bottom -
        this.barGap * (this.itemCount - 1)) /
      this.itemCount
    );
  }

  private getBarOptions(
    data: any,
    scaleX: d3.ScaleLinear<number, number, never>,
    indexs: Map<string, number>,
    sec: number
  ): BarOptions {
    if (!Number.isNaN(data[this.valueField])) {
      this.lastValue.set(data[this.idField], data[this.valueField]);
    }
    data[this.valueField] = this.lastValue.get(data[this.idField]);
    const alpha = d3
      .scaleLinear([this.itemCount - 1, this.itemCount], [1, 0.001])
      .clamp(true)(indexs.get(data[this.idField]));
    return {
      id: data[this.idField],
      pos: {
        x: this.margin.left + this.barPadding + this.labelPlaceholder,
        y:
          this.margin.top +
          indexs.get(data[this.idField]) * (this.barHeight + this.barGap),
      },
      alpha: alpha * this.alphaScale(sec),
      value: data[this.valueField],
      shape: { width: scaleX(data[this.valueField]), height: this.barHeight },
      color: colorPicker.getColor(data[this.colorField]),
      radius: 4,
    };
  }

  private getCurrentData(sec: number) {
    const currentData = [...this.dataScales.values()]
      .map((scale) => {
        return scale(sec);
      })
      // .filter((d) => !Number.isNaN(d[this.valueField]))
      .filter((d) => d !== undefined)
      .sort((a, b) => {
        if (Number.isNaN(b[this.valueField])) {
          return -1;
        } else if (Number.isNaN(a[this.valueField])) {
          return 1;
        } else {
          return b[this.valueField] - a[this.valueField];
        }
      });
    // .slice(0, this.itemCount);
    return currentData;
  }

  private getBarComponent(options: BarOptions) {
    const res = new Component({
      position: options.pos,
      alpha: options.alpha,
    });
    const bar = new Rect({
      shape: options.shape,
      fillStyle: options.color,
      radius: options.radius,
      clip: true,
    });
    const label = new Text(
      this.getLabelTextOptions(
        this.labelFormat(options.id, this.meta),
        options.color,
        options.shape.height * 0.8
      )
    );
    const valueLabel = new Text({
      textBaseline: "bottom",
      text: `${this.valueFormat(options.value)}`,
      // textAlign: "left",
      position: {
        x: options.shape.width + this.barPadding,
        y: options.shape.height,
      },
      fontSize: options.shape.height * 0.8,
      font: "Sarasa Mono SC",
      fillStyle: options.color,
    });
    const imagePlaceholder = options.image ? options.shape.height : 0;
    const barInfo = new Text({
      textAlign: "right",
      textBaseline: "bottom",
      text: this.barInfoFormat(options.id, this.meta),
      position: {
        x: options.shape.width - this.barPadding - imagePlaceholder,
        y: options.shape.height,
      },
      fontSize: options.shape.height * 0.8,
      font: "Sarasa Mono SC",
      fontWeight: "bolder",
      fillStyle: "#1e1e1e",
    });
    if (options.image) {
      const img = new Image({
        path: options.image,
        position: {
          x: options.shape.width - options.shape.height,
          y: 0,
        },
        shape: {
          width: options.shape.height,
          height: options.shape.height,
        },
      });
      bar.children.push(img);
    }
    bar.children.push(barInfo);
    res.children.push(bar);
    res.children.push(valueLabel);
    res.children.push(label);
    return res as Component;
  }

  private getLabelTextOptions(
    text: string,
    color = "#fff",
    fontSize: number = 16
  ): Text {
    return {
      text: `${text}`,
      textAlign: "right",
      textBaseline: "bottom",
      fontSize,
      font: "Sarasa Mono SC",
      position: { x: 0 - this.barPadding, y: fontSize / 0.8 },
      fillStyle: color,
    };
  }

  private setData() {
    this.data = _.cloneDeep(recourse.data.get("data"));
    this.data.forEach((d: any) => {
      Object.keys(d).forEach((k) => {
        switch (k) {
          case this.dateField:
            // 日期字符串转成日期
            d[k] = new Date(
              new Date().getTimezoneOffset() * 60 * 1000 +
                new Date(d[this.dateField]).getTime()
            );
            break;
          case this.idField:
            // ID保持不变
            break;
          default:
            // 数值转成数字
            if (this.valueKeys.includes(k)) {
              d[k] = +d[k];
            }
        }
      });
    });
  }

  private setDataScales() {
    const dateExtent = d3.extent(this.data, (d) => d[this.dateField]);
    this.secToDate = d3.scaleLinear(this.aniTime, dateExtent).clamp(true);
    const g = d3.group(this.data, (d) => d[this.idField]);
    const dataScales = new Map();
    g.forEach((dataList, k) => {
      const dateList = dataList.map((d) => d[this.dateField]);
      const secList = dateList.map((d) => this.secToDate.invert(d));
      const dataScale = d3.scaleLinear(secList, dataList).clamp(true);
      dataScales.set(k, dataScale);
    });
    this.dataScales = dataScales;
  }
}
