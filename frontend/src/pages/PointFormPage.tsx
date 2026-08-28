import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createPoint, uploadContextPhoto } from "../api/client";

type FormState = {
  monitor_point_id: string;
  hazard_id: string;
  hazard_name: string;
  monitor_point_name: string;
  structure_id: string;
  structure_name: string;
  location_description: string;
};

const EMPTY_FORM: FormState = {
  monitor_point_id: "",
  hazard_id: "",
  hazard_name: "",
  monitor_point_name: "",
  structure_id: "",
  structure_name: "",
  location_description: "",
};

export default function PointFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [contextPhoto, setContextPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof FormState>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const point = await createPoint(form);
      if (contextPhoto) {
        await uploadContextPhoto(point.monitor_point_id, contextPhoto);
      }
      navigate(`/points/${point.monitor_point_id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "监测点创建失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page point-form-page">
      <div className="page-heading compact">
        <div>
          <p className="eyebrow">新建监测点</p>
          <h1>登记一条待复测的裂缝</h1>
          <p>标靶 ID 由系统自动分配，创建后可在详情页下载复测贴。</p>
        </div>
      </div>

      {error ? <div className="notice error" role="alert">{error}</div> : null}

      <form className="point-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>监测点编号
          <input required value={form.monitor_point_id} onChange={(event) => update("monitor_point_id", event.target.value)} />
        </label>
        <label>隐患点编号
          <input required value={form.hazard_id} onChange={(event) => update("hazard_id", event.target.value)} />
        </label>
        <label>隐患点名称
          <input required value={form.hazard_name} onChange={(event) => update("hazard_name", event.target.value)} />
        </label>
        <label>监测点名称
          <input required value={form.monitor_point_name} onChange={(event) => update("monitor_point_name", event.target.value)} />
        </label>
        <label>构筑物编号
          <input required value={form.structure_id} onChange={(event) => update("structure_id", event.target.value)} />
        </label>
        <label>构筑物名称
          <input required value={form.structure_name} onChange={(event) => update("structure_name", event.target.value)} />
        </label>
        <label className="wide">位置描述
          <input required value={form.location_description} onChange={(event) => update("location_description", event.target.value)} />
        </label>
        <label className="wide">现场全景（可选）
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) => setContextPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <button className="button primary large" type="submit" disabled={busy}>{busy ? "正在创建…" : "创建监测点"}</button>
      </form>
    </section>
  );
}
