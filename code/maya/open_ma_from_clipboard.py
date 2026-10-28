# -*- coding: utf-8 -*-
"""
从剪切板读取 .ma 路径并打开
用法：把 .ma 文件路径复制到剪切板（带不带引号都行），然后跑这个脚本
"""

import os
import maya.cmds as cmds
from PySide2.QtWidgets import QApplication


def open_ma_from_clipboard():
    app = QApplication.instance()
    if not app:
        print("没有 QApplication 实例，脚本要在 Maya 里跑")
        return

    raw = app.clipboard().text()
    print("剪切板原始内容:", repr(raw))

    # 去空白 + 去两端引号（Windows 的"复制为路径"会带双引号）
    txt = raw.strip().strip('"').strip("'").strip()

    if not txt:
        print("剪切板是空的")
        return

    if not txt.lower().endswith(".ma"):
        print("剪切板内容不是 .ma 路径:", txt)
        cmds.confirmDialog(
            title="错误",
            message="剪切板内容不是一个有效的 .ma 文件路径。",
            button=["OK"],
        )
        return

    if not os.path.exists(txt):
        print("文件不存在:", txt)
        cmds.confirmDialog(
            title="错误",
            message="文件不存在:\n{}".format(txt),
            button=["OK"],
        )
        return

    cmds.file(txt, open=True, force=True)
    print("已打开:", txt)


if __name__ == "__main__":
    try:
        open_ma_from_clipboard()
    except Exception as e:
        cmds.confirmDialog(
            title="错误",
            message="读取剪切板时出错: {}".format(e),
            button=["OK"],
        )
        raise
