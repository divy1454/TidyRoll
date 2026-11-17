# Third-party notices

Tidyroll includes the following components. Full licence texts are in the `licenses` folder.

| Component | Used for | Licence | Copyright |
| --- | --- | --- | --- |
| MobileNetV2 (OpenCV Zoo, `image_classification_mobilenetv2_2022apr_int8.onnx`) | Scene and object labels | Apache License 2.0 | OpenCV Zoo contributors |
| YuNet face detector (OpenCV Zoo, `face_detection_yunet_2026may.onnx`) | Finding faces | MIT | 2020 Shiqi Yu |
| ONNX Runtime Web 1.31.1 | Running the models | MIT | Microsoft Corporation |
| exifr 7.1.3 (lite build) | Reading photo dates and GPS | MIT | 2020 Mike Kovařík, Mutiny.cz |
| fflate 0.8.3 | ZIP downloads | MIT | Arjun Barrett |
| Natural Earth admin-0 countries 1:50m, via world-atlas 2.0.2 | Country borders | Public domain (Natural Earth); ISC (world-atlas packaging) | Mike Bostock (world-atlas) |
| GeoNames cities5000 | Town names and time zones | CC BY 4.0 | GeoNames, geonames.org |
| Sofia Sans, Sofia Sans Extra Condensed | Typefaces | SIL Open Font License 1.1 | 2019 The Sofia Sans Project Authors |

The ImageNet class names in `web/models/imagenet-labels.txt` are the output labels of the MobileNetV2 model.

**GeoNames attribution (required by CC BY 4.0):** This product contains data from GeoNames (https://www.geonames.org/), licensed under the Creative Commons Attribution 4.0 License (https://creativecommons.org/licenses/by/4.0/). The data was reduced to places with 5,000 or more people and re-encoded (`web/data/cities.tsv`).

**Natural Earth:** Made with Natural Earth. Free vector and raster map data @ naturalearthdata.com. The borders were simplified and re-encoded (`web/data/countries.json`).
