import Image from "next/image";
import React from "react";
import bg from "@/assets/bg.jpg";
import "./style.css";

const HomePage = () => {
  return (
    <div className="w-full h-screen relative">
      <div className="box absolute left-100 top-20 ">
        <Image
          src={bg}
          alt="Description"
          width={1280}
          height={720}
          className="w-[800px] -top-20 absolute right-0 img"
        />
      </div>
    </div>
  );
};

export default HomePage;
