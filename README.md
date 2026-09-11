# dsh-reqsys

**需求管理系统**（行迹 & 未竟）—— DSH（DeepSeek Harness）插件。

从 [dsh-pet](https://github.com/Ringo-P-GIT/dah-pet-ringo_P)（魔改版）剥离为独立插件，不再依赖宠物。

## 功能

- **行迹** —— 浏览、检索、导入/导出需求列表
- **未竟** —— 跟踪未完成任务
- **双击唤醒** —— 双击宠物/桥接事件弹出快速录入框
- **数据持久化** —— 需求存储于 `~/.dsh/requirements/data.json`

## 安装

本插件作为 DSH profile 依赖安装，通过 `cordis.patch.yml` 注入插件行。

```bash
# 在 profile 目录下
pnpm add dsh-reqsys
```

配置 `profile/cordis.patch.yml`：

```yaml
- insert:
    - id: reqsys
      name: 'dsh-reqsys'
      config: {}
```

## 开发

```bash
git clone https://github.com/Ringo-P-GIT/dsh-reqsys
cd dsh-reqsys
# 无额外依赖；peerDeps 由 DSH 运行时提供
```

## API

| 端点 | 方法 | 说明 |
|---|---|---|
| `/dsh-reqsys/api/requirements` | GET | 获取所有需求 |
| `/dsh-reqsys/api/requirements` | POST | 新增需求 |
| `/dsh-reqsys/api/requirements/:id` | PUT | 更新需求 |
| `/dsh-reqsys/api/requirements/:id` | DELETE | 删除需求 |

## 许可

MIT