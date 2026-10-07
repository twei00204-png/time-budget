# 时间预算（PWA）
纯 HTML/CSS/JS，无需构建。整个文件夹丢到任何 HTTPS 静态托管即可。
- 本地试跑：`python3 -m http.server 8000` 然后打开 http://localhost:8000
- 数据：localStorage（键 tb.v1），设置页可导出/导入 JSON、导出 CSV
- 改了文件后，把 sw.js 里的 VERSION +1，旧缓存才会被替换

## 课程表数据结构（V2 联动；现在可通过“导入 JSON”手动填入 schedule 字段）
"schedule": { "1": [ {"s":"08:00","e":"09:30","c":"免疫","t":"class"} ], "2": [ {"s":"14:00","e":"17:30","c":"有机","t":"lab"} ] }
键 1=周一…7=周日；t 为 class 或 lab。填了之后首页会显示“满课/实验日/课少”。
